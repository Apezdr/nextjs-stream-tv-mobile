/**
 * Axios-based HTTP client with interceptors for authentication,
 * error handling, and retry logic
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios, { AxiosInstance, AxiosError } from "axios";

// Define common API error response structure
interface ApiErrorResponse {
  message?: string;
  error?: string;
  [key: string]: unknown;
}

// Global token refresh function - will be set by EnhancedApiClient
let globalTokenRefreshFunction: (() => Promise<boolean>) | null = null;
// Global server status check function - will be set by AuthProvider
let globalServerStatusCheckFunction: (() => Promise<void>) | null = null;

// Debouncing for server status checks to prevent excessive requests
let serverStatusCheckTimeout: NodeJS.Timeout | null = null;
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
    if (__DEV__) {
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
        if (__DEV__) {
          console.log("[Axios] Performing debounced server status check");
        }
        await globalServerStatusCheckFunction();
      } catch (error) {
        console.warn("[Axios] Debounced server status check failed:", error);
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
      try {
        const authData = await AsyncStorage.getItem("auth");
        if (authData) {
          const { sessionId, authToken } = JSON.parse(authData);

          // Add session ID as header
          if (sessionId) {
            config.headers["x-session-id"] = sessionId;

            // Also add as query parameter for compatibility
            const url = new URL(config.url || "", config.baseURL);
            if (!url.searchParams.has("sessionId")) {
              url.searchParams.append("sessionId", sessionId);
              config.url = url.pathname + url.search;
            }
          }

          // Add Bearer token
          if (authToken && !config.headers.Authorization) {
            config.headers.Authorization = `Bearer ${authToken}`;
          }
        }
      } catch (error) {
        console.warn("Failed to retrieve auth data:", error);
      }

      // Add request timestamp for logging
      config.metadata = { startTime: Date.now() };

      if (__DEV__) {
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

      if (__DEV__ && response.config.metadata) {
        const duration = Date.now() - response.config.metadata.startTime;
        console.log(
          `[Axios] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status} (${duration}ms)`,
        );
      }

      return response;
    },
    async (error: AxiosError) => {
      const originalRequest = error.config;
      const endpoint = originalRequest?.url || "";

      // Record failure for circuit breaker
      if (error.response?.status && error.response.status >= 500) {
        circuitBreaker.recordFailure(endpoint);

        // Check server status for 5xx errors (debounced)
        if (__DEV__) {
          console.log(
            `[Axios] Server error ${error.response.status} detected, scheduling server status check`,
          );
        }
        debouncedServerStatusCheck();
      }

      // Also check server status for network errors (debounced)
      if (!error.response) {
        if (__DEV__) {
          console.log(
            "[Axios] Network error detected, scheduling server status check",
          );
        }
        debouncedServerStatusCheck();
      }

      // Handle 401 Unauthorized
      if (
        error.response?.status === 401 &&
        !originalRequest?._retry &&
        originalRequest
      ) {
        originalRequest._retry = true;

        // Try to refresh token using the callback from AuthProvider
        if (globalTokenRefreshFunction) {
          try {
            if (__DEV__) {
              console.log("[Axios] Attempting token refresh for 401 error");
            }

            const refreshSuccessful = await globalTokenRefreshFunction();

            if (refreshSuccessful) {
              if (__DEV__) {
                console.log(
                  "[Axios] Token refresh successful, retrying original request",
                );
              }

              // Get the updated auth data from AsyncStorage
              const authData = await AsyncStorage.getItem("auth");
              if (authData) {
                const { sessionId, authToken } = JSON.parse(authData);

                // Update the original request with new auth headers
                if (sessionId && originalRequest) {
                  originalRequest.headers = originalRequest.headers || {};
                  originalRequest.headers["x-session-id"] = sessionId;
                }

                if (authToken && originalRequest) {
                  originalRequest.headers = originalRequest.headers || {};
                  originalRequest.headers["Authorization"] =
                    `Bearer ${authToken}`;
                }
              }

              // Retry the original request with new token if it exists
              if (originalRequest) {
                return client(originalRequest);
              }
              return Promise.reject(error);
            } else {
              if (__DEV__) {
                console.log(
                  "[Axios] Token refresh failed - AuthProvider should handle logout",
                );
              }
              // Don't clear AsyncStorage here - let AuthProvider handle the logout
              // The refreshToken function in AuthProvider will call signOut() if refresh fails
            }
          } catch (refreshError) {
            console.error("[Axios] Token refresh error:", refreshError);
            // Don't clear AsyncStorage here - let AuthProvider handle the logout
          }
        } else {
          if (__DEV__) {
            console.log(
              "[Axios] No token refresh function available, clearing auth data",
            );
          }
          await AsyncStorage.removeItem("auth");
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
          if (__DEV__) {
            console.log(
              `[Axios] Retrying request (${retryCount + 1}/${RETRY_CONFIG.retries}) after ${delay}ms`,
            );
          }

          await new Promise((resolve) => setTimeout(resolve, delay));
          return client(originalRequest);
        }
      }

      // Log error details in development
      if (__DEV__) {
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
