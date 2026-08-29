/**
 * Axios-based HTTP client with interceptors for authentication,
 * error handling, and retry logic
 */
import axios, { AxiosInstance, AxiosError } from "axios";

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
// Global server status check function - will be set by AuthProvider
let globalServerStatusCheckFunction: (() => Promise<void>) | null = null;

export function setAxiosAuthToken(token: string | null) {
  globalAuthToken = token;
}

// Debouncing for server status checks to prevent excessive requests
let serverStatusCheckTimeout: ReturnType<typeof setTimeout> | null = null;
let lastServerStatusCheck = 0;
const SERVER_STATUS_CHECK_DEBOUNCE = 5000; // 5 seconds minimum between checks

export function setTokenRefreshFunction(
  refreshFn: (() => Promise<boolean>) | null,
) {
  globalTokenRefreshFunction = refreshFn;
}

export function setServerStatusCheckFunction(
  checkFn: (() => Promise<void>) | null,
) {
  globalServerStatusCheckFunction = checkFn;
}

// Debounced server status check to prevent excessive requests
function debouncedServerStatusCheck(): void {
  if (!globalServerStatusCheckFunction) return;

  const now = Date.now();

  // If we've checked recently, don't check again
  if (now - lastServerStatusCheck < SERVER_STATUS_CHECK_DEBOUNCE) {
    if (AXIOS_DEBUG_ENABLED) {
      console.log("[Axios] Server status check skipped - too recent");
    }
    return;
  }

  // Clear any pending timeout
  if (serverStatusCheckTimeout) {
    clearTimeout(serverStatusCheckTimeout);
  }

  // Set a timeout to perform the check
  serverStatusCheckTimeout = setTimeout(async () => {
    if (globalServerStatusCheckFunction) {
      try {
        lastServerStatusCheck = Date.now();
        if (AXIOS_DEBUG_ENABLED) {
          console.log("[Axios] Performing debounced server status check");
        }
        await globalServerStatusCheckFunction();
      } catch (error) {
        if (AXIOS_DEBUG_ENABLED) {
          console.warn("[Axios] Debounced server status check failed:", error);
        }
      }
    }
    serverStatusCheckTimeout = null;
  }, 1000); // Wait 1 second before actually checking
}

// Extend Axios types to include our custom metadata and retry properties
declare module "axios" {
  export interface InternalAxiosRequestConfig {
    metadata?: {
      startTime: number;
    };
    _retry?: boolean;
    _retryCount?: number;
  }
}

// Custom error class for API errors
export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown, message?: string) {
    super(message || `API Error: ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

// Configuration for retry logic
const RETRY_CONFIG = {
  retries: 3,
  retryDelay: (retryCount: number) => Math.pow(2, retryCount) * 1000, // Exponential backoff
  retryCondition: (error: AxiosError) => {
    // A cancelled request has no `error.response`, so without this it would
    // fall into the network-error branch below and be retried 3x with backoff —
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

// Circuit breaker configuration
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
}

class CircuitBreaker {
  private states: Map<string, CircuitBreakerState> = new Map();
  private readonly threshold = 5; // Open circuit after 5 failures
  private readonly timeout = 60000; // 60 seconds before trying again
  private readonly resetTime = 300000; // Reset failure count after 5 minutes of success

  isOpen(endpoint: string): boolean {
    const state = this.states.get(endpoint);
    if (!state) return false;

    if (state.state === "OPEN") {
      // Check if we should transition to HALF_OPEN
      if (Date.now() - state.lastFailureTime > this.timeout) {
        state.state = "HALF_OPEN";
        return false;
      }
      return true;
    }

    return false;
  }

  recordSuccess(endpoint: string): void {
    const state = this.states.get(endpoint);
    if (state) {
      if (Date.now() - state.lastFailureTime > this.resetTime) {
        this.states.delete(endpoint);
      } else if (state.state === "HALF_OPEN") {
        state.state = "CLOSED";
        state.failures = 0;
      }
    }
  }

  recordFailure(endpoint: string): void {
    const state = this.states.get(endpoint) || {
      failures: 0,
      lastFailureTime: 0,
      state: "CLOSED" as const,
    };

    state.failures++;
    state.lastFailureTime = Date.now();

    if (state.failures >= this.threshold) {
      state.state = "OPEN";
    }

    this.states.set(endpoint, state);
  }
}

// Create Axios instance factory
export function createAxiosClient(baseURL?: string): AxiosInstance {
  const circuitBreaker = new CircuitBreaker();

  const client = axios.create({
    baseURL,
    timeout: 30000, // 30 second timeout
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
      // resolve EVERY status, silently bypassing the 401 refresh interceptor
      // and the circuit breaker. With this, `undefined` falls back to the
      // instance default and only an explicit `null` accepts all statuses.
      validateStatusUndefinedResolves: false,
    },
  });

  // Request interceptor
  client.interceptors.request.use(
    async (config) => {
      // Check circuit breaker
      const endpoint = config.url || "";
      if (circuitBreaker.isOpen(endpoint)) {
        throw new Error(`Circuit breaker is open for ${endpoint}`);
      }

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
      const endpoint = response.config.url || "";
      circuitBreaker.recordSuccess(endpoint);

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
      // otherwise trip the network-error branch, fire a server-status check,
      // and (via retryCondition) get retried with backoff. React Query cancels
      // in-flight queries on navigation, so on TV this would turn every screen
      // change into a burst of pointless requests and false server-down
      // signals.
      if (axios.isCancel(error)) {
        return Promise.reject(error);
      }

      const originalRequest = error.config;
      const endpoint = originalRequest?.url || "";

      // Record failure for circuit breaker
      if (error.response?.status && error.response.status >= 500) {
        circuitBreaker.recordFailure(endpoint);

        // Check server status for 5xx errors (debounced)
        if (AXIOS_DEBUG_ENABLED) {
          console.log(
            `[Axios] Server error ${error.response.status} detected, scheduling server status check`,
          );
        }
        debouncedServerStatusCheck();
      }

      // Also check server status for network errors (debounced)
      if (!error.response) {
        if (AXIOS_DEBUG_ENABLED) {
          console.log(
            "[Axios] Network error detected, scheduling server status check",
          );
        }
        debouncedServerStatusCheck();
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

      // Implement retry logic
      if (
        RETRY_CONFIG.retryCondition(error) &&
        originalRequest &&
        !originalRequest._retry
      ) {
        const retryCount = originalRequest._retryCount || 0;

        if (retryCount < RETRY_CONFIG.retries) {
          originalRequest._retryCount = retryCount + 1;

          const delay = RETRY_CONFIG.retryDelay(retryCount);
          if (AXIOS_DEBUG_ENABLED) {
            console.log(
              `[Axios] Retrying request (${retryCount + 1}/${RETRY_CONFIG.retries}) after ${delay}ms`,
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
