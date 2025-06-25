/**
 * React Query client configuration with persistence and TV-specific optimizations
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  QueryClient,
  QueryCache,
  MutationCache,
  DehydratedState,
} from "@tanstack/react-query";
import { Platform } from "react-native";

// Custom error handler
const handleError = (error: unknown) => {
  if (__DEV__) {
    console.error("[React Query Error]:", error);
  }

  // You can add custom error reporting here (e.g., Sentry)
};

// Global state for watch mode detection
let isWatchMode = false;

export const setWatchMode = (enabled: boolean) => {
  isWatchMode = enabled;
  // Update existing queries with new cache time when mode changes
  if (enabled) {
    // Reduce cache time for watch mode
    queryClient.setDefaultOptions({
      queries: {
        ...queryClient.getDefaultOptions().queries,
        gcTime: 2 * 60 * 1000, // 2 minutes during watch mode
      },
    });
  } else {
    // Restore normal cache time
    queryClient.setDefaultOptions({
      queries: {
        ...queryClient.getDefaultOptions().queries,
        gcTime: Platform.isTV ? 10 * 60 * 1000 : 5 * 60 * 1000,
      },
    });
  }
};

export const getWatchMode = () => isWatchMode;

// Create query client with TV-optimized settings
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time: how long data is considered fresh
      staleTime: Platform.isTV ? 60 * 1000 : 30 * 1000, // 1 min for TV, 30s for mobile

      // Cache time: how long inactive data stays in cache
      gcTime: Platform.isTV ? 10 * 60 * 1000 : 5 * 60 * 1000, // 10 min for TV, 5 min for mobile

      // Retry configuration
      retry: (failureCount, error: Error & { status?: number }) => {
        // Don't retry on 4xx errors
        const status = error?.status;
        if (status !== undefined && status >= 400 && status < 500) {
          return false;
        }
        return failureCount < 3;
      },

      // Retry delay with exponential backoff
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Refetch on window focus (useful for TV apps)
      refetchOnWindowFocus: Platform.isTV ? false : true,

      // Don't refetch on reconnect for TV (usually stable connection)
      refetchOnReconnect: Platform.isTV ? false : true,

      // Network mode
      networkMode: "online", // 'online' | 'always' | 'offlineFirst'
    },
    mutations: {
      // Mutation retry configuration
      retry: 1,
      retryDelay: 1000,

      // Network mode for mutations
      networkMode: "online",
    },
  },
  queryCache: new QueryCache({
    onError: handleError,
    onSuccess: (data, query) => {
      if (__DEV__) {
        console.log("[Query Success]:", query.queryKey);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: handleError,
    onSuccess: (data, variables, context, mutation) => {
      if (__DEV__) {
        console.log("[Mutation Success]:", mutation.options.mutationKey);
      }
    },
  }),
});

// Persistence configuration
export const persistOptions = {
  persister: {
    persistClient: async (client: DehydratedState) => {
      try {
        await AsyncStorage.setItem(
          "REACT_QUERY_OFFLINE_CACHE",
          JSON.stringify(client),
        );
      } catch (error) {
        console.error("Failed to persist query client:", error);
      }
    },
    restoreClient: async () => {
      try {
        const cache = await AsyncStorage.getItem("REACT_QUERY_OFFLINE_CACHE");
        return cache ? JSON.parse(cache) : undefined;
      } catch (error) {
        console.error("Failed to restore query client:", error);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await AsyncStorage.removeItem("REACT_QUERY_OFFLINE_CACHE");
      } catch (error) {
        console.error("Failed to remove query client:", error);
      }
    },
  },
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  buster: "", // Cache buster for versioning
};

// Helper to clear all caches
export async function clearAllCaches() {
  queryClient.clear();
  await AsyncStorage.removeItem("REACT_QUERY_OFFLINE_CACHE");
}

// Helper to invalidate specific query patterns
export function invalidateQueries(pattern: string | RegExp) {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey.join(".");
      return typeof pattern === "string"
        ? key.includes(pattern)
        : pattern.test(key);
    },
  });
}

// TV-specific helpers
export const tvQueryHelpers = {
  // Suspend background queries during watch mode
  suspendBackgroundQueries: () => {
    console.log("[QueryClient] Suspending background queries for watch mode");

    // Cancel all infinite content queries
    queryClient.cancelQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return key === "infiniteContentList" || key === "contentList";
      },
    });

    // Pause all non-essential queries
    queryClient
      .getQueryCache()
      .getAll()
      .forEach((query) => {
        const key = query.queryKey[0];
        if (
          key === "infiniteContentList" ||
          key === "contentList" ||
          key === "banner"
        ) {
          query.cancel();
        }
      });
  },

  // Resume background queries when leaving watch mode
  resumeBackgroundQueries: () => {
    console.log("[QueryClient] Resuming background queries");
    // Queries will automatically resume when components re-mount or refetch
  },

  // Cancel queries when navigating away
  cancelQueriesForRoute: (routeName: string) => {
    queryClient.cancelQueries({
      predicate: (query) => query.queryKey[0] === routeName,
    });
  },

  // Clear old browse cache to free memory for video
  clearBrowseCache: () => {
    console.log("[QueryClient] Clearing browse cache for watch mode");
    queryClient.removeQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return key === "infiniteContentList" || key === "contentList";
      },
    });
  },
};
