// src/stores/backdropStore.ts

import { create } from "zustand";
const BACKDROP_DEBUG_ENABLED =
  __DEV__ && process.env.BACKDROP_DEBUG?.toLowerCase() === "true";
import { subscribeWithSelector } from "zustand/middleware";

// Types for backdrop options
export interface BackdropOptions {
  fade?: boolean;
  message?: string;
  duration?: number;
  blurhash?: string;
}

export interface HideOptions {
  fade?: boolean;
  duration?: number;
}

// Animation configuration
export interface AnimationConfig {
  fadeIn: boolean;
  fadeOut: boolean;
  duration: number;
}

// Backdrop state interface
interface BackdropState {
  // Core state
  url: string | null;
  blurhash: string | null;
  visible: boolean;
  message: string | undefined;

  // Animation state
  isAnimating: boolean;
  animationConfig: AnimationConfig;

  // Performance tracking
  lastUpdateTime: number;
  renderCount: number;

  // Internal state for managing async operations
  _hideTimeoutId: NodeJS.Timeout | null;
}

// Backdrop actions interface
interface BackdropActions {
  // Core actions
  show: (url: string, options?: BackdropOptions) => void;
  hide: (options?: HideOptions) => void;
  update: (url: string, blurhash?: string) => void;
  setMessage: (message?: string) => void;
  reset: () => void;

  // Animation actions
  setAnimating: (isAnimating: boolean) => void;

  // Performance tracking
  incrementRenderCount: () => void;

  // Utility actions
  getCurrentState: () => BackdropState;
  isBackdropVisible: () => boolean;
}

// Combined store type
export type BackdropStore = BackdropState & BackdropActions;

// Initial state
const initialState: BackdropState = {
  url: null,
  blurhash: null,
  visible: false,
  message: undefined,
  isAnimating: false,
  animationConfig: {
    fadeIn: false,
    fadeOut: false,
    duration: 300,
  },
  lastUpdateTime: 0,
  renderCount: 0,
  _hideTimeoutId: null,
};

// Create the backdrop store with subscribeWithSelector middleware for performance
export const useBackdropStore = create<BackdropStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // Core actions
    show: (url: string, options?: BackdropOptions) => {
      const now = Date.now();
      const currentState = get();

      // Check if we're already showing the same backdrop with same options
      const isSameUrl = currentState.url === url;
      const isSameBlurhash =
        currentState.blurhash === (options?.blurhash ?? null);
      const isSameMessage = currentState.message === options?.message;
      const isAlreadyVisible = currentState.visible;

      // If everything is the same and already visible, don't update
      if (isSameUrl && isSameBlurhash && isSameMessage && isAlreadyVisible) {
        if (BACKDROP_DEBUG_ENABLED) {
          console.log(
            "[BackdropStore] show() - already showing same backdrop, skipping update",
          );
        }
        return;
      }

      set((state) => {
        // Cancel any pending hide timeout when showing
        if (state._hideTimeoutId) {
          clearTimeout(state._hideTimeoutId);
        }

        return {
          url,
          blurhash: options?.blurhash ?? null,
          message: options?.message,
          visible: true,
          isAnimating: options?.fade ?? true,
          animationConfig: {
            fadeIn: options?.fade ?? true,
            fadeOut: false,
            duration: options?.duration ?? 300,
          },
          lastUpdateTime: now,
          _hideTimeoutId: null,
        };
      });

      if (BACKDROP_DEBUG_ENABLED) {
        console.log("[BackdropStore] show():", url, options);
      }
    },

    hide: (options?: HideOptions) => {
      const now = Date.now();

      set((state) => {
        // Cancel any existing hide timeout
        if (state._hideTimeoutId) {
          clearTimeout(state._hideTimeoutId);
        }

        // Set up new hide timeout
        const duration = options?.duration ?? 300;
        const hideTimeoutId = setTimeout(() => {
          set((currentState) => {
            // Only clear state if this timeout hasn't been cancelled
            if (currentState._hideTimeoutId === hideTimeoutId) {
              return {
                visible: false,
                url: null,
                blurhash: null,
                message: undefined,
                isAnimating: false,
                _hideTimeoutId: null,
              };
            }
            return currentState;
          });
        }, duration);

        return {
          isAnimating: options?.fade ?? true,
          animationConfig: {
            fadeIn: false,
            fadeOut: options?.fade ?? true,
            duration,
          },
          lastUpdateTime: now,
          _hideTimeoutId: hideTimeoutId,
        };
      });

      if (BACKDROP_DEBUG_ENABLED) {
        console.log("[BackdropStore] hide():", options);
      }
    },

    update: (url: string, blurhash?: string) => {
      const now = Date.now();

      set((state) => {
        // Only update if URL actually changed
        if (state.url === url && state.blurhash === blurhash) {
          return state;
        }

        return {
          url,
          blurhash: blurhash ?? null,
          lastUpdateTime: now,
        };
      });

      if (BACKDROP_DEBUG_ENABLED) {
        console.log("[BackdropStore] update():", url, blurhash);
      }
    },

    setMessage: (message?: string) => {
      set((state) => {
        // Only update if message actually changed
        if (state.message === message) {
          return state;
        }

        return {
          message,
          lastUpdateTime: Date.now(),
        };
      });

      if (BACKDROP_DEBUG_ENABLED) {
        console.log("[BackdropStore] setMessage():", message);
      }
    },

    reset: () => {
      const state = get();
      if (state._hideTimeoutId) {
        clearTimeout(state._hideTimeoutId);
      }
      set(initialState);
      if (BACKDROP_DEBUG_ENABLED) {
        console.log("[BackdropStore] reset()");
      }
    },

    // Animation actions
    setAnimating: (isAnimating: boolean) => {
      set({ isAnimating });
    },

    // Performance tracking
    incrementRenderCount: () => {
      set((state) => ({
        renderCount: state.renderCount + 1,
      }));
    },

    // Utility actions
    getCurrentState: () => get(),

    isBackdropVisible: () => get().visible,
  })),
);

// Selectors for optimized subscriptions
export const backdropSelectors = {
  // Visual state selectors
  visual: (state: BackdropStore) => ({
    url: state.url,
    blurhash: state.blurhash,
    visible: state.visible,
    message: state.message,
  }),

  // Animation state selectors
  animation: (state: BackdropStore) => ({
    isAnimating: state.isAnimating,
    animationConfig: state.animationConfig,
  }),

  // Performance selectors
  performance: (state: BackdropStore) => ({
    lastUpdateTime: state.lastUpdateTime,
    renderCount: state.renderCount,
  }),

  // Individual property selectors for maximum optimization
  url: (state: BackdropStore) => state.url,
  visible: (state: BackdropStore) => state.visible,
  message: (state: BackdropStore) => state.message,
  isAnimating: (state: BackdropStore) => state.isAnimating,
};

// Performance monitoring subscription
if (BACKDROP_DEBUG_ENABLED) {
  useBackdropStore.subscribe(backdropSelectors.performance, (performance) => {
    console.log("[BackdropStore] Performance:", performance);
  });
}
