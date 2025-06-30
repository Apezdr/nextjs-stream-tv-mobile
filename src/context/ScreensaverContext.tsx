import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
  useCallback,
  useMemo,
} from "react";
import { Animated } from "react-native";

import { useRemoteActivity } from "@/src/context/RemoteActivityContext";
import { useTVAppState } from "@/src/context/TVAppStateContext";
import { contentService } from "@/src/data/services/contentService";
import { ScreensaverResponse } from "@/src/data/types/content.types";

interface ScreensaverError {
  message: string;
  timestamp: number;
}

interface ScreensaverContextType {
  isScreensaverActive: boolean;
  screensaverContent: ScreensaverResponse | null;
  opacity: Animated.Value;
  loadScreensaverContent: () => Promise<void>;
  showScreensaver: () => void;
  hideScreensaver: () => void;
  // Direct communication from video players
  setVideoPlayingState: (isPlaying: boolean) => void;
  // Error state
  error: ScreensaverError | null;
  clearError: () => void;
}

const ScreensaverContext = createContext<ScreensaverContextType | null>(null);

// Configuration constants
const SCREENSAVER_TIMEOUT = 120_000; // 2 minutes
const SCREENSAVER_REFRESH_INTERVAL = 15_000;
const ERROR_RESET_TIMEOUT = 30_000; // Reset error state after 30 seconds

export const ScreensaverProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [isScreensaverActive, setIsScreensaverActive] = useState(false);
  const [screensaverContent, setScreensaverContent] =
    useState<ScreensaverResponse | null>(null);
  const [error, setError] = useState<ScreensaverError | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs for performance and timer management
  const opacity = useRef(new Animated.Value(0)).current;
  const isPlayingRef = useRef<boolean>(false);

  // Consolidated timer management
  const timersRef = useRef<{
    screensaver: NodeJS.Timeout | null;
    refresh: NodeJS.Timeout | null;
    delayedRefresh: NodeJS.Timeout | null;
    errorReset: NodeJS.Timeout | null;
  }>({
    screensaver: null,
    refresh: null,
    delayedRefresh: null,
    errorReset: null,
  });

  // Get state from contexts
  const { currentMode, setMode } = useTVAppState();
  const { isRemoteActive } = useRemoteActivity();

  // Clear all timers utility
  const clearAllTimers = useCallback(() => {
    Object.entries(timersRef.current).forEach(([key, timer]) => {
      if (timer) {
        if (key === "refresh") {
          clearInterval(timer);
        } else {
          clearTimeout(timer);
        }
        timersRef.current[key as keyof typeof timersRef.current] = null;
      }
    });
  }, []);

  // Error handling utilities
  const clearError = useCallback(() => {
    setError(null);
    if (timersRef.current.errorReset) {
      clearTimeout(timersRef.current.errorReset);
      timersRef.current.errorReset = null;
    }
  }, []);

  const setErrorWithTimeout = useCallback(
    (errorMessage: string) => {
      const newError: ScreensaverError = {
        message: errorMessage,
        timestamp: Date.now(),
      };

      setError(newError);

      // Auto-clear error after timeout
      if (timersRef.current.errorReset) {
        clearTimeout(timersRef.current.errorReset);
      }

      timersRef.current.errorReset = setTimeout(() => {
        clearError();
      }, ERROR_RESET_TIMEOUT);
    },
    [clearError],
  );

  // Enhanced content loading - retry logic handled by enhanced API client
  const loadScreensaverContent = useCallback(async (): Promise<void> => {
    try {
      const content = await contentService.getScreensaver();

      // Validate content before setting
      if (!content) {
        throw new Error("Received empty screensaver content");
      }

      setScreensaverContent(content);
      clearError(); // Clear any existing errors

      console.log(
        "[ScreensaverContext] Successfully loaded screensaver content",
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Unknown error loading screensaver content";
      console.error(
        "[ScreensaverContext] Failed to load content:",
        errorMessage,
      );

      // Set error state - retries are now handled by the enhanced API client
      setErrorWithTimeout(
        `Failed to load screensaver content: ${errorMessage}`,
      );
    }
  }, [clearError, setErrorWithTimeout]);

  const showScreensaver = useCallback(() => {
    if (isScreensaverActive) return;

    console.log("[ScreensaverContext] Activating screensaver");
    setIsScreensaverActive(true);

    // Set mode to screensaver when activating
    if (currentMode !== "screensaver") {
      console.log("[ScreensaverContext] Setting mode to screensaver");
      setMode("screensaver");
    }

    // Load initial content
    loadScreensaverContent();

    // Animate in
    Animated.timing(opacity, {
      toValue: 1,
      duration: 1_000,
      useNativeDriver: true,
    }).start();

    // Clear existing refresh timers
    if (timersRef.current.refresh) {
      clearInterval(timersRef.current.refresh);
      timersRef.current.refresh = null;
    }

    if (timersRef.current.delayedRefresh) {
      clearTimeout(timersRef.current.delayedRefresh);
      timersRef.current.delayedRefresh = null;
    }

    // Set up delayed content refresh to avoid immediate refresh after initial load
    console.log("[ScreensaverContext] Setting up delayed content refresh");
    timersRef.current.delayedRefresh = setTimeout(() => {
      console.log(
        "[ScreensaverContext] Starting regular content refresh interval",
      );
      timersRef.current.refresh = setInterval(() => {
        console.log(
          "[ScreensaverContext] Refresh interval triggered, loading new content",
        );
        loadScreensaverContent();
      }, SCREENSAVER_REFRESH_INTERVAL);

      timersRef.current.delayedRefresh = null;
    }, SCREENSAVER_REFRESH_INTERVAL);
  }, [
    isScreensaverActive,
    loadScreensaverContent,
    opacity,
    currentMode,
    setMode,
  ]);

  const hideScreensaver = useCallback(() => {
    if (!isScreensaverActive) return;

    console.log("[ScreensaverContext] Deactivating screensaver");

    // Return to browse mode when hiding screensaver
    if (currentMode === "screensaver") {
      console.log("[ScreensaverContext] Returning to browse mode");
      setMode("browse");
    }

    // Animate out
    Animated.timing(opacity, {
      toValue: 0,
      duration: 1_000,
      useNativeDriver: true,
    }).start(() => {
      setIsScreensaverActive(false);
      setScreensaverContent(null); // Clear content when hidden
    });

    // Stop refresh timers
    if (timersRef.current.refresh) {
      clearInterval(timersRef.current.refresh);
      timersRef.current.refresh = null;
    }

    if (timersRef.current.delayedRefresh) {
      clearTimeout(timersRef.current.delayedRefresh);
      timersRef.current.delayedRefresh = null;
    }
  }, [isScreensaverActive, opacity, currentMode, setMode]);

  // Optimized video playing state setter
  const setVideoPlayingState = useCallback(
    (playing: boolean) => {
      // Only update if state actually changed
      if (isPlayingRef.current !== playing) {
        console.log("[ScreensaverContext] Video playing state changed:", {
          from: isPlayingRef.current,
          to: playing,
          currentMode,
          timestamp: new Date().toISOString(),
        });

        isPlayingRef.current = playing;
        setIsPlaying(playing);

        // If video starts playing and screensaver is active, hide it immediately
        if (playing && isScreensaverActive) {
          console.log(
            "[ScreensaverContext] Immediately hiding screensaver due to video playback",
          );
          hideScreensaver();
        }
      }
    },
    [currentMode, isScreensaverActive, hideScreensaver],
  );

  // Memoize activity state to prevent unnecessary re-renders
  const isUserActive = useMemo(() => {
    return isPlaying || isRemoteActive || isPlayingRef.current;
  }, [isPlaying, isRemoteActive]);

  // Main effect to control screensaver activation - optimized dependencies
  useEffect(() => {
    console.log("[ScreensaverContext] Activity state changed:", {
      isPlaying,
      isRemoteActive,
      isPlayingRef: isPlayingRef.current,
      isUserActive,
      isScreensaverActive,
      timestamp: new Date().toISOString(),
    });

    // Capture ref values at the time the effect runs
    const timerRefs = timersRef.current;

    // Clear existing screensaver timer
    if (timerRefs.screensaver) {
      clearTimeout(timerRefs.screensaver);
      timerRefs.screensaver = null;
    }

    // Clear refresh interval if user becomes active
    if (isUserActive && timerRefs.refresh) {
      console.log(
        "[ScreensaverContext] Clearing content refresh due to user activity",
      );
      clearInterval(timerRefs.refresh);
      timerRefs.refresh = null;
    }

    if (isUserActive) {
      // Activity detected - hide screensaver immediately
      console.log(
        "[ScreensaverContext] User activity detected, hiding screensaver",
      );
      hideScreensaver();
    } else if (!isScreensaverActive) {
      // No activity and screensaver not active - set timeout
      console.log(
        "[ScreensaverContext] No activity detected, setting screensaver timeout",
      );

      timerRefs.screensaver = setTimeout(() => {
        // Double-check activity state before showing
        if (!isPlayingRef.current) {
          console.log(
            "[ScreensaverContext] Timeout expired, showing screensaver",
          );
          showScreensaver();
        } else {
          console.log(
            "[ScreensaverContext] Cancelled screensaver - detected late activity",
          );
        }
      }, SCREENSAVER_TIMEOUT);
    }

    // Cleanup function using captured ref values
    return () => {
      if (timerRefs.screensaver) {
        clearTimeout(timerRefs.screensaver);
        timerRefs.screensaver = null;
      }
    };
  }, [
    isUserActive,
    isScreensaverActive,
    showScreensaver,
    hideScreensaver,
    isPlaying,
    isRemoteActive,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log(
        "[ScreensaverContext] Component unmounting, cleaning up all timers...",
      );
      clearAllTimers();
      opacity.setValue(0);
    };
  }, [clearAllTimers, opacity]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      isScreensaverActive,
      screensaverContent,
      opacity,
      loadScreensaverContent,
      showScreensaver,
      hideScreensaver,
      setVideoPlayingState,
      error,
      clearError,
    }),
    [
      isScreensaverActive,
      screensaverContent,
      opacity,
      loadScreensaverContent,
      showScreensaver,
      hideScreensaver,
      setVideoPlayingState,
      error,
      clearError,
    ],
  );

  return (
    <ScreensaverContext.Provider value={contextValue}>
      {children}
    </ScreensaverContext.Provider>
  );
};

export const useScreensaver = () => {
  const ctx = useContext(ScreensaverContext);
  if (!ctx) {
    throw new Error("useScreensaver must be used within a ScreensaverProvider");
  }
  return ctx;
};

// Error boundary component for screensaver-related errors
export class ScreensaverErrorBoundary extends React.Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    console.error("[ScreensaverErrorBoundary] Caught error:", error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ScreensaverErrorBoundary] Error details:", {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }

    return this.props.children;
  }
}
