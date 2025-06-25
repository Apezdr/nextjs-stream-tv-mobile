/**
 * React Query Provider with persistence
 * Wraps the app with QueryClient and provides offline support
 */
import { QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { Platform } from "react-native";

import { queryClient } from "@/src/data/query/queryClient";

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  // You can add React Query DevTools here for development
  // Note: DevTools only work in development mode

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Add DevTools for debugging in development */}
      {__DEV__ && Platform.isTV && (
        // React Query DevTools are not compatible with TV platforms
        // You can add a custom debug overlay for TV if needed
        <></>
      )}
    </QueryClientProvider>
  );
}
