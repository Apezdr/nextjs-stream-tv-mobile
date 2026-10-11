/**
 * React Query client configuration with persistence and TV-specific optimizations
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
const QUERY_DEBUG_ENABLED =
  __DEV__ && process.env.QUERY_DEBUG?.toLowerCase() === "true";
import {
  QueryClient,
  QueryCache,
  MutationCache,
  DehydratedState,
  focusManager,
} from "@tanstack/react-query";
import { AppState, Platform, type AppStateStatus } from "react-native";

// Teach React Query what "focused" means on React Native.
//
// Without this, `refetchOnWindowFocus` below is DEAD CONFIG on both platforms.
// The default focusManager binds `window.addEventListener("visibilitychange")`,
// which never fires under RN, and its `isFocused()` falls back to
// `globalThis.document?.visibilityState !== "hidden"` — `document` is undefined
// here, so it reports focused forever. Mobile therefore never got the
// foreground refetch its `true` asks for, and the TV `false` was defending
// against an event that could not fire.
//
// Safe for the polling screens: every refetchInterval in the app (my-list,
// MyListPageContent) also sets `refetchIntervalInBackground: true`, so they opt
// out of focus gating and keep polling regardless of what this reports.
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener(
    "change",
    (status: AppStateStatus) => {
      handleFocus(status === "active");
    },
  );
  return () => subscription.remove();
});

// Custom error handler
const handleError = (error: unknown) => {
  if (QUERY_DEBUG_ENABLED) {
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

      // Refetch stale active queries when the network comes back. Live config
      // now that useNetworkStatus feeds onlineManager; before that, nothing on
      // React Native ever told React Query the network had gone or returned.
      // TV is included: an Ethernet or Wi-Fi drop on a SHIELD is exactly the
      // case where the rows on screen are stale and nothing else refetches.
      refetchOnReconnect: true,

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
      if (QUERY_DEBUG_ENABLED) {
        console.log("[Query Success]:", query.queryKey);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: handleError,
    onSuccess: (data, variables, context, mutation) => {
      if (QUERY_DEBUG_ENABLED) {
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
  // Cancel first. Sign-out calls this, and a request that was already in
  // flight would otherwise resolve *after* the clear and repopulate the cache
  // with the previous user's data.
  await queryClient.cancelQueries();
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

// Keys come from the `queryKeys` factory: ["api", "content", <kind>, ...].
// Matching on `queryKey[0]` alone (the old "infiniteContentList" /
// "contentList" strings) never matched anything the factory produces, so
// these helpers were silent no-ops for the whole life of the watch screen.
const BROWSE_LIST_KINDS = new Set(["list", "infiniteList"]);
const BACKGROUND_KINDS = new Set(["list", "infiniteList", "banner"]);

function contentKind(queryKey: readonly unknown[]): string | null {
  return queryKey[0] === "api" &&
    queryKey[1] === "content" &&
    typeof queryKey[2] === "string"
    ? queryKey[2]
    : null;
}

// TV-specific helpers
export const tvQueryHelpers = {
  // Suspend background queries during watch mode
  suspendBackgroundQueries: () => {
    if (QUERY_DEBUG_ENABLED) {
      console.log("[QueryClient] Suspending background queries for watch mode");
    }

    // Cancel in-flight browse-list and banner queries
    queryClient.cancelQueries({
      predicate: (query) => {
        const kind = contentKind(query.queryKey);
        return kind !== null && BACKGROUND_KINDS.has(kind);
      },
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

  // Clear old browse cache to free memory for video. Only INACTIVE list
  // queries are dropped: the browse screen underneath the watch route still
  // observes its rows, and removing an observed query makes React Query
  // refetch it immediately — the opposite of freeing memory.
  clearBrowseCache: () => {
    if (QUERY_DEBUG_ENABLED) {
      console.log("[QueryClient] Clearing browse cache for watch mode");
    }
    queryClient.removeQueries({
      predicate: (query) => {
        const kind = contentKind(query.queryKey);
        return (
          kind !== null && BROWSE_LIST_KINDS.has(kind) && !query.isActive()
        );
      },
    });
  },
};
