/**
 * Enhanced API client that integrates Axios with the existing API structure
 * Maintains backward compatibility while adding React Query support
 */
import type { AxiosRequestConfig } from "axios";

import {
  getAxiosInstance,
  setAxiosBaseURL,
  setAxiosAuthToken,
  setTokenRefreshFunction,
  ApiError as AxiosApiError,
} from "@/src/data/api/axiosClient";

export interface RequestOptions {
  headers?: HeadersInit;
  skipAuth?: boolean;
  signal?: AbortSignal; // For request cancellation
  // Statuses the caller treats as a normal outcome: not retried by the
  // transport and not reported to the server-health store. The request
  // still rejects with an ApiError carrying the status.
  expectedStatuses?: number[];
  // Transport-level retries. Default 0 — React Query retries what it fetches;
  // only fire-and-forget writes nobody else retries should ask for these.
  retries?: number;
  // Per-request override of the client's default timeout (axiosClient).
  timeout?: number;
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
    setAxiosAuthToken(token);
  }

  setTokenRefreshCallback(callback: (() => Promise<boolean>) | null) {
    this.logDebug(
      `Setting token refresh callback: ${callback ? "provided" : "null"}`,
    );
    this.tokenRefreshCallback = callback;
    // Also set it in the axios client for 401 error handling
    setTokenRefreshFunction(callback);
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
      expectedStatuses: options.expectedStatuses,
      retries: options.retries,
      ...(options.timeout !== undefined && { timeout: options.timeout }),
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
}

// Create a singleton API client instance
export const enhancedApiClient = new EnhancedApiClient();

// Export as default for easy migration
export default enhancedApiClient;
