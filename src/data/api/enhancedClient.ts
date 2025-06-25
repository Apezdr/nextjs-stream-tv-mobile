/**
 * Enhanced API client that integrates Axios with the existing API structure
 * Maintains backward compatibility while adding React Query support
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AxiosRequestConfig } from "axios";

import {
  getAxiosInstance,
  setAxiosBaseURL,
  setTokenRefreshFunction,
  setServerStatusCheckFunction,
  ApiError as AxiosApiError,
} from "@/src/data/api/axiosClient";
import { API_ENDPOINTS } from "@/src/data/api/endpoints";
import type {
  ServerStatusResponse,
  ServerStatusSummary,
} from "@/src/data/types/serverStatus.types";

export interface RequestOptions {
  headers?: HeadersInit;
  skipAuth?: boolean;
  signal?: AbortSignal; // For request cancellation
}

export interface CacheOptions {
  ttl: number; // Time to live in milliseconds
  key: string; // Cache key
  enabled: boolean; // Whether caching is enabled for this request
}

// Re-export ApiError for backward compatibility
export { AxiosApiError as ApiError };

// Enable this flag for detailed API logging
export const DEBUG_API = __DEV__;

export class EnhancedApiClient {
  private baseUrl: string | null = null;
  private authToken: string | null = null;
  private sessionId: string | null = null;
  private debugMode: boolean = DEBUG_API;
  private tokenRefreshCallback: (() => Promise<boolean>) | null = null;

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.setBaseUrl(baseUrl);
    }
  }

  // Enable or disable debug mode
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  // Internal logging method
  private logDebug(message: string, data?: unknown): void {
    if (this.debugMode) {
      if (data) {
        console.log(`[Enhanced API Client] ${message}`, data);
      } else {
        console.log(`[Enhanced API Client] ${message}`);
      }
    }
  }

  setBaseUrl(url: string | null) {
    this.logDebug(`Setting base URL: ${url || "null"}`);
    this.baseUrl = url;
    if (url) {
      setAxiosBaseURL(url);
    }
  }

  setAuthToken(token: string | null) {
    this.logDebug(`Setting auth token: ${token ? "********" : "null"}`);
    this.authToken = token;
    // Store in AsyncStorage for axios interceptor
    this.updateStoredAuth();
  }

  setSessionId(sessionId: string | null) {
    this.logDebug(`Setting session ID: ${sessionId || "null"}`);
    this.sessionId = sessionId;
    // Store in AsyncStorage for axios interceptor
    this.updateStoredAuth();
  }

  setTokenRefreshCallback(callback: (() => Promise<boolean>) | null) {
    this.logDebug(
      `Setting token refresh callback: ${callback ? "provided" : "null"}`,
    );
    this.tokenRefreshCallback = callback;
    // Also set it in the axios client for 401 error handling
    setTokenRefreshFunction(callback);
  }

  setServerStatusCheckCallback(callback: (() => Promise<void>) | null) {
    this.logDebug(
      `Setting server status check callback: ${callback ? "provided" : "null"}`,
    );
    // Set it in the axios client for server error handling
    setServerStatusCheckFunction(callback);
  }

  private async updateStoredAuth() {
    try {
      const authData = {
        authToken: this.authToken,
        sessionId: this.sessionId,
      };
      await AsyncStorage.setItem("auth", JSON.stringify(authData));
    } catch (error) {
      console.error("Failed to store auth data:", error);
    }
  }

  getBaseUrl(): string | null {
    return this.baseUrl;
  }

  /**
   * Make an HTTP request using Axios
   * This method is designed to be backward compatible with the existing API
   */
  async request<T>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    data?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new Error("API client baseUrl not set. Call setBaseUrl first.");
    }

    const axiosInstance = getAxiosInstance();

    const config: AxiosRequestConfig = {
      url: endpoint,
      method,
      data,
      headers: options.headers as Record<string, string>,
      signal: options.signal,
    };

    // Handle skipAuth option
    if (options.skipAuth) {
      config.headers = {
        ...config.headers,
        "X-Skip-Auth": "true",
      };
    }

    // The axios interceptor handles error transformation
    const response = await axiosInstance.request<T>(config);
    return response.data;
  }

  /**
   * Request with caching support - for React Query integration
   * This method returns the raw promise for React Query to handle caching
   */
  async requestForQuery<T>(
    endpoint: string,
    method: "GET" = "GET",
    options?: RequestOptions,
  ): Promise<T> {
    // React Query will handle caching, so we just make the request
    return this.request<T>(endpoint, method, undefined, options);
  }

  // Convenience methods
  get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, "GET", undefined, options);
  }

  post<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>(endpoint, "POST", data, options);
  }

  put<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>(endpoint, "PUT", data, options);
  }

  delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, "DELETE", undefined, options);
  }

  /**
   * Legacy method for backward compatibility
   * React Query will handle caching, so this just delegates to request
   */
  async requestWithCache<T>(
    endpoint: string,
    method: "GET" = "GET",
    cacheOptions?: CacheOptions,
    options?: RequestOptions,
  ): Promise<T> {
    this.logDebug(
      `Legacy requestWithCache called for ${endpoint} - delegating to request`,
    );
    return this.request<T>(endpoint, method, undefined, options);
  }

  /**
   * Check server status with retries
   * Returns server status summary or null if NextJS app is completely down
   */
  async checkServerStatus(
    maxRetries: number = 3,
    retryDelay: number = 2000,
  ): Promise<ServerStatusSummary | null> {
    if (!this.baseUrl) {
      this.logDebug("Cannot check server status: no base URL set");
      return null;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logDebug(
          `Checking server status (attempt ${attempt}/${maxRetries})`,
        );

        // Create a React Native-compatible timeout using Promise.race
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Request timeout")), 5000);
        });

        const requestPromise = this.request<ServerStatusResponse>(
          API_ENDPOINTS.SYSTEM.STATUS,
          "GET",
          undefined,
          {}, // No signal needed since we're using Promise.race for timeout
        );

        const response = await Promise.race([requestPromise, timeoutPromise]);

        this.logDebug("Server status check successful");
        return this.parseServerStatus(response);
      } catch (error) {
        this.logDebug(
          `Server status check failed (attempt ${attempt}):`,
          error,
        );

        // If this is the last attempt, NextJS app is down
        if (attempt === maxRetries) {
          this.logDebug(
            "NextJS app marked as down after all retry attempts failed",
          );
          return {
            isNextJSAppDown: true,
            hasServerIssues: false,
            overallLevel: "error",
            message:
              "NextJS application is currently unavailable. Please try again later.",
            serverIssues: [],
          };
        }

        // Wait before retrying
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    return null;
  }

  /**
   * Parse server status response and determine issues
   */
  private parseServerStatus(
    response: ServerStatusResponse,
  ): ServerStatusSummary {
    const serverIssues = response.servers.filter(
      (server) => server.level === "error" || server.level === "warning",
    );

    const hasServerIssues = serverIssues.length > 0;
    const isNextJSAppDown = false; // If we got a response, NextJS is up

    let message = response.overall.message;
    if (hasServerIssues) {
      const errorCount = serverIssues.filter((s) => s.level === "error").length;
      const warningCount = serverIssues.filter(
        (s) => s.level === "warning",
      ).length;

      if (errorCount > 0 && warningCount > 0) {
        message = `${errorCount} server(s) down, ${warningCount} server(s) with warnings`;
      } else if (errorCount > 0) {
        message = `${errorCount} server(s) experiencing issues`;
      } else {
        message = `${warningCount} server(s) with warnings`;
      }
    }

    return {
      isNextJSAppDown,
      hasServerIssues,
      overallLevel: response.overall.level,
      message,
      serverIssues,
    };
  }
}

// Create a singleton API client instance
export const enhancedApiClient = new EnhancedApiClient();

// Export as default for easy migration
export default enhancedApiClient;
