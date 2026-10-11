/**
 * Axios-based HTTP client with interceptors for authentication,
 * error handling, and retry logic
 */
import axios, { AxiosInstance, AxiosError } from "axios";

import { serverHealth } from "@/src/stores/serverHealthStore";

// Define common API error response structure
const AXIOS_DEBUG_ENABLED =
  __DEV__ && process.env.AXIOS_DEBUG?.toLowerCase() === "true";
interface ApiErrorResponse {
  message?: string;
  error?: string;
  [key: string]: unknown;
}

// Current auth token - set synchronously by EnhancedApiClient.setAuthToken().
// Previously this was persisted to AsyncStorage and re-read per request, but
// that write was un-awaited and raced with AuthProvider flipping `apiReady`,
// so the very first authenticated request after login/refresh could go out
// with no Authorization header. A plain in-memory value can't race.
let globalAuthToken: string | null = null;
// Global token refresh function - will be set by EnhancedApiClient
let globalTokenRefreshFunction: (() => Promise<boolean>) | null = null;

export function setAxiosAuthToken(token: string | null) {
  globalAuthToken = token;
}

export function setTokenRefreshFunction(
  refreshFn: (() => Promise<boolean>) | null,
) {
  globalTokenRefreshFunction = refreshFn;
}

// Extend Axios types to include our custom metadata and retry properties
declare module "axios" {
  export interface AxiosRequestConfig {
    // Statuses the CALLER handles as a normal outcome (e.g. direct-info's 504
    // "still deriving, Retry-After: 30"). They are not retried here, and they
    // are not reported to the server-health store — a caller polling on its
    // own schedule is not evidence of an outage.
    expectedStatuses?: number[];
    // Transport-level retries for THIS request. Default 0: React Query owns
    // retries for everything it fetches, and two retry layers multiplied — a
    // hanging search used to spin for eight minutes (4 axios tries × 4 React
    // Query attempts × 30 s). Only fire-and-forget writes that nothing else
    // retries (playback progress, presence) ask for these.
    retries?: number;
  }
  export interface InternalAxiosRequestConfig {
    metadata?: {
      startTime: number;
    };
    _retry?: boolean;
    _retryCount?: number;
    expectedStatuses?: number[];
    retries?: number;
  }
}

/**
 * The server's `Retry-After` header in milliseconds (delta-seconds or an
 * HTTP-date), or undefined when absent or unparseable.
 */
export function parseRetryAfterMs(
  value: string | number | undefined | null,
  now: number = Date.now(),
): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return parseInt(text, 10) * 1000;
  const at = Date.parse(text);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, at - now);
}

// Custom error class for API errors
export class ApiError extends Error {
  status: number;
  data: unknown;
  /** From the response's `Retry-After` header, when the server sent one. */
  retryAfterMs?: number;

  constructor(
    status: number,
    data: unknown,
    message?: string,
    retryAfterMs?: number,
  ) {
    super(message || `API Error: ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

// Configuration for retry logic
const RETRY_CONFIG = {
  retryDelay: (retryCount: number) => Math.pow(2, retryCount) * 1000, // Exponential backoff
  retryCondition: (error: AxiosError) => {
    // A cancelled request has no `error.response`, so without this it would
    // fall into the network-error branch below and be retried with backoff —
    // the exact opposite of what cancelling means. This matters now that
    // React Query forwards its AbortSignal into these requests.
    if (axios.isCancel(error)) return false;

    // A malformed baseURL is not transient. Since axios 1.18 `buildFullPath`
    // rejects urls like `https:/host` with ERR_INVALID_URL from inside the
    // adapter, so there is no `error.response` and this would otherwise retry
    // an un-fixable URL at 1s/2s/4s on every single call.
    if (error.code === "ERR_INVALID_URL") return false;

    // Retry on network errors or 5xx errors
    return (
      !error.response ||
      (error.response.status >= 500 && error.response.status < 600)
    );
  },
};

// Default per-request timeout. The slowest request this app makes in normal
// use is a media-details fetch, at a few seconds; this is already several
// times that. It matters when requests hang (packets dropped, no RST): the
// timeout is what ends each attempt, so it bounds how long a screen can
// spin. A request that legitimately needs longer passes its own `timeout`.
export const DEFAULT_TIMEOUT_MS = 15000;

// Create Axios instance factory
export function createAxiosClient(baseURL?: string): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      "Content-Type": "application/json",
    },
    // axios >= 1.17: AxiosError.toJSON() replaces these keys (case-insensitive,
    // at any depth, including AxiosHeaders) with "[REDACTED ****]". Anything
    // that serialises an error — the dev warn in errorReportingService, or any
    // future crash report — then cannot carry a live bearer token off-device.
    // Complements the manual masking in the debug logger below, which logs the
    // config object directly rather than going through toJSON().
    redact: ["authorization", "cookie"],
    transitional: {
      // A per-request `validateStatus: undefined` would otherwise make settle()
      // resolve EVERY status, silently bypassing the 401 refresh interceptor.
      // With this, `undefined` falls back to the instance default and only an
      // explicit `null` accepts all statuses.
      validateStatusUndefinedResolves: false,
    },
  });

  // Request interceptor
  client.interceptors.request.use(
    async (config) => {
      // Add authentication headers
      if (globalAuthToken && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${globalAuthToken}`;
      }

      // Add request timestamp for logging
      config.metadata = { startTime: Date.now() };

      if (AXIOS_DEBUG_ENABLED) {
        console.log(`[Axios] ${config.method?.toUpperCase()} ${config.url}`, {
          headers: {
            ...config.headers,
            Authorization: config.headers.Authorization ? "***" : undefined,
          },
          data: config.data,
        });
      }

      return config;
    },
    (error) => {
      return Promise.reject(error);
    },
  );

  // Response interceptor
  client.interceptors.response.use(
    (response) => {
      // Any answer from the server is proof it can be reached. This is what
      // clears the "can't reach the server" banner the moment anything works,
      // instead of waiting for the next scheduled probe.
      serverHealth.noteSuccess();

      if (AXIOS_DEBUG_ENABLED && response.config.metadata) {
        const duration = Date.now() - response.config.metadata.startTime;
        console.log(
          `[Axios] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status} (${duration}ms)`,
        );
      }

      return response;
    },
    async (error: AxiosError) => {
      // Cancellation is not a failure — bail out before ANY of the handling
      // below. A CanceledError carries no `error.response`, so it would
      // otherwise look like a network error, be reported as a possible
      // outage, and (via retryCondition) get retried with backoff. React
      // Query cancels in-flight queries on navigation, so on TV this would
      // turn every screen change into a burst of pointless requests and
      // false server-down signals.
      if (axios.isCancel(error)) {
        return Promise.reject(error);
      }

      const originalRequest = error.config;
      const endpoint = originalRequest?.url || "";
      const status = error.response?.status;
      const isExpectedStatus =
        status !== undefined &&
        !!originalRequest?.expectedStatuses?.includes(status);

      // No response at all, or a 5xx: the server MAY be unreachable. The
      // health store decides that with its own probe; this only hands it the
      // facts. A 4xx is an answer, and an expected status is the caller's.
      if (
        !isExpectedStatus &&
        (!error.response || (status !== undefined && status >= 500))
      ) {
        if (AXIOS_DEBUG_ENABLED) {
          console.log(
            `[Axios] ${status ?? error.code ?? "no response"} on ${endpoint}, reported to server-health`,
          );
        }
        serverHealth.noteFailure({
          url: endpoint,
          ...(status !== undefined && { status }),
          ...(error.code && { code: error.code }),
          ...(error.response && {
            viaCloudflare: !!error.response.headers?.["cf-ray"],
          }),
        });
      }

      // Handle an authentication failure on a content request.
      //
      // 401 and 403 are both treated as "the session might be gone", but
      // NEITHER is treated as proof of it. The verification callback re-asks
      // better-auth's get-session, and only that authoritative answer can
      // trigger a sign-out. This distinction matters: better-auth returns 403
      // for a live-but-stale session (SESSION_NOT_FRESH), for permission
      // denials, and for its CSRF origin check — signing out on any of those
      // would evict a perfectly valid user.
      //
      // Only a 401 is worth replaying afterwards; a 403 that survives
      // verification is a genuine authorization decision, and retrying it
      // would just fail again.
      const authStatus = error.response?.status;
      if (
        (authStatus === 401 || authStatus === 403) &&
        !originalRequest?._retry &&
        originalRequest
      ) {
        originalRequest._retry = true;

        // Try to refresh token using the callback from AuthProvider
        if (globalTokenRefreshFunction) {
          try {
            if (AXIOS_DEBUG_ENABLED) {
              console.log(
                `[Axios] Verifying session after ${authStatus} on ${endpoint}`,
              );
            }

            const refreshSuccessful = await globalTokenRefreshFunction();

            if (refreshSuccessful && authStatus === 401) {
              if (AXIOS_DEBUG_ENABLED) {
                console.log(
                  "[Axios] Token refresh successful, retrying original request",
                );
              }

              // Re-attach the current token (refreshToken() re-validates the
              // existing session, it doesn't rotate the bearer token, so this
              // is the same value — just re-applied in case it wasn't set
              // when the original request first went out).
              if (globalAuthToken && originalRequest) {
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers["Authorization"] =
                  `Bearer ${globalAuthToken}`;
              }

              // Retry the original request with new token if it exists
              if (originalRequest) {
                return client(originalRequest);
              }
              return Promise.reject(error);
            } else {
              if (AXIOS_DEBUG_ENABLED) {
                console.log(
                  refreshSuccessful
                    ? `[Axios] Session is live — ${authStatus} on ${endpoint} is an authorization decision, not a dead session`
                    : "[Axios] Session verification failed — AuthProvider owns the sign-out",
                );
              }
              // Nothing to do here either way. When the session really is
              // gone, the verification callback has already signed out; when
              // it is alive, the error belongs to the caller.
            }
          } catch (refreshError) {
            if (AXIOS_DEBUG_ENABLED) {
              console.error("[Axios] Token refresh error:", refreshError);
            }
            // Don't clear AsyncStorage here - let AuthProvider handle the logout
          }
        } else {
          if (AXIOS_DEBUG_ENABLED) {
            console.log(
              "[Axios] No token refresh function available, clearing auth data",
            );
          }
          setAxiosAuthToken(null);
        }
      }

      // Transport-level retry, only for requests that asked for it.
      const maxRetries = originalRequest?.retries ?? 0;
      if (
        !isExpectedStatus &&
        RETRY_CONFIG.retryCondition(error) &&
        originalRequest &&
        !originalRequest._retry
      ) {
        const retryCount = originalRequest._retryCount || 0;

        if (retryCount < maxRetries) {
          originalRequest._retryCount = retryCount + 1;

          const delay = RETRY_CONFIG.retryDelay(retryCount);
          if (AXIOS_DEBUG_ENABLED) {
            console.log(
              `[Axios] Retrying request (${retryCount + 1}/${maxRetries}) after ${delay}ms`,
            );
          }

          await new Promise((resolve) => setTimeout(resolve, delay));
          return client(originalRequest);
        }
      }

      // Log error details in development
      if (AXIOS_DEBUG_ENABLED) {
        console.error(`[Axios] Request failed:`, {
          url: error.config?.url,
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        });
      }

      // Transform to ApiError
      if (error.response) {
        const errorMessage =
          (error.response.data as ApiErrorResponse)?.message ||
          (error.response.data as ApiErrorResponse)?.error ||
          error.message;

        throw new ApiError(
          error.response.status,
          error.response.data,
          errorMessage,
          parseRetryAfterMs(error.response.headers?.["retry-after"]),
        );
      }

      throw error;
    },
  );

  return client;
}

// Singleton instance
let axiosInstance: AxiosInstance | null = null;

export function getAxiosInstance(): AxiosInstance {
  if (!axiosInstance) {
    axiosInstance = createAxiosClient();
  }
  return axiosInstance;
}

export function setAxiosBaseURL(baseURL: string): void {
  if (!axiosInstance) {
    axiosInstance = createAxiosClient(baseURL);
  } else {
    axiosInstance.defaults.baseURL = baseURL;
  }
}

// Export configured axios instance
export default getAxiosInstance();
