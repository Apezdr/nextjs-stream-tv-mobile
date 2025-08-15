// src/hooks/useBackdrop.ts

import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  useBackdropStore,
  backdropSelectors,
  type BackdropOptions,
  type HideOptions,
} from "@/src/stores/backdropStore";

/**
 * Hook for accessing backdrop visual state (url, blurhash, visible, message)
 * Uses shallow comparison to prevent unnecessary re-renders
 */
export const useBackdrop = () => {
  return useBackdropStore(useShallow(backdropSelectors.visual));
};

/**
 * Hook for accessing backdrop animation state
 * Separate from visual state to optimize re-renders
 */
export const useBackdropAnimation = () => {
  return useBackdropStore(useShallow(backdropSelectors.animation));
};

/**
 * Hook for backdrop actions only (no state subscriptions)
 * This prevents re-renders when state changes
 */
export const useBackdropActions = () => {
  return useBackdropStore(
    useShallow((state) => ({
      show: state.show,
      hide: state.hide,
      update: state.update,
      setMessage: state.setMessage,
      reset: state.reset,
      setAnimating: state.setAnimating,
    })),
  );
};

/**
 * Hook for individual backdrop properties
 * Use these for maximum performance when you only need specific values
 */
export const useBackdropUrl = () => useBackdropStore(backdropSelectors.url);
export const useBackdropVisible = () =>
  useBackdropStore(backdropSelectors.visible);
export const useBackdropMessage = () =>
  useBackdropStore(backdropSelectors.message);
export const useBackdropAnimating = () =>
  useBackdropStore(backdropSelectors.isAnimating);

/**
 * Convenience hook that combines actions with common patterns
 * Provides higher-level backdrop management functions
 */
export const useBackdropManager = () => {
  const actions = useBackdropActions();
  const isVisible = useBackdropVisible();

  const showBackdrop = useCallback(
    (url: string, options?: BackdropOptions) => {
      actions.show(url, options);
    },
    [actions],
  );

  const hideBackdrop = useCallback(
    (options?: HideOptions) => {
      actions.hide(options);
    },
    [actions],
  );

  const updateBackdrop = useCallback(
    (url: string, blurhash?: string) => {
      actions.update(url, blurhash);
    },
    [actions],
  );

  const setBackdropMessage = useCallback(
    (message?: string) => {
      actions.setMessage(message);
    },
    [actions],
  );

  const resetBackdrop = useCallback(() => {
    actions.reset();
  }, [actions]);

  const showOrHide = useCallback(
    (url?: string, options?: BackdropOptions) => {
      if (url) {
        showBackdrop(url, options);
      } else {
        hideBackdrop(options);
      }
    },
    [showBackdrop, hideBackdrop],
  );

  return {
    // State
    isVisible,

    // Actions
    show: showBackdrop,
    hide: hideBackdrop,
    update: updateBackdrop,
    setMessage: setBackdropMessage,
    reset: resetBackdrop,
    showOrHide,
  };
};

/**
 * Hook for performance monitoring in development
 */
export const useBackdropPerformance = () => {
  if (__DEV__) {
    return useBackdropStore(useShallow(backdropSelectors.performance));
  }
  return { lastUpdateTime: 0, renderCount: 0 };
};

/**
 * Hook for components that need to track backdrop state changes
 * Useful for logging or analytics
 */
export const useBackdropSubscription = (
  callback: (state: ReturnType<typeof backdropSelectors.visual>) => void,
) => {
  return useBackdropStore.subscribe(backdropSelectors.visual, callback);
};
