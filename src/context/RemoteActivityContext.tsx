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
import { Platform, useTVEventHandler, type HWEvent } from "react-native";

interface RemoteActivityContextType {
  isRemoteActive: boolean;
  isUserInteracting: boolean; // New: tracks continuous interaction
  resetActivityTimer: () => void;
  startContinuousActivity: () => void; // New: for hold/seek
  stopContinuousActivity: () => void; // New: when releasing
  registerPlayPauseHandler: (handler: () => void) => void;
  unregisterPlayPauseHandler: () => void;
  registerSeekHandler: (handler: (seconds: number) => void) => void;
  unregisterSeekHandler: () => void;
}

const RemoteActivityContext = createContext<RemoteActivityContextType | null>(
  null,
);

// Timeout for hiding controls after no activity
const REMOTE_ACTIVITY_TIMEOUT = 5000; // 5 seconds

// Per-key logging is off by default: the handler runs on key-down, key-up and
// every auto-repeat, and console calls are expensive in a Metro-attached build.
const DEBUG_REMOTE_ACTIVITY = false;

interface RemoteActivityProviderProps {
  children: ReactNode;
  customTimeout?: number;
}

export const RemoteActivityProvider: React.FC<RemoteActivityProviderProps> = ({
  children,
  customTimeout,
}) => {
  const [isRemoteActive, setIsRemoteActive] = useState(true);
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  // Ref mirror of isUserInteracting. This is the fix for the original
  // stuck-overlay bug: every guard that decides whether to (re)schedule the
  // hide MUST read the ref, because useTVEventHandler's callback can hold a
  // closure from before the interaction state changed.
  const isUserInteractingRef = useRef(false);
  const playPauseHandlerRef = useRef<(() => void) | null>(null);
  const seekHandlerRef = useRef<((seconds: number) => void) | null>(null);
  const timeout = customTimeout || REMOTE_ACTIVITY_TIMEOUT;
  const timeoutRef = useRef(timeout);
  timeoutRef.current = timeout;

  // The pending hide lives in a ref, NOT in state. This provider wraps the
  // whole TV app and its callbacks run on every remote key event including
  // auto-repeat, so any state write here would re-render the app root (and,
  // because useTVEventHandler keys its effect on the handler identity, tear
  // down and re-add the native key listener) many times a second while
  // navigating. Writing `setIsRemoteActive(true)` when it is already true hits
  // React's eager bailout and costs nothing.
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = useCallback(() => {
    if (activityTimerRef.current) {
      clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;
    }
    // Read the REF, never the state — a stale `false` here is what previously
    // left the overlay pinned for the rest of the session.
    if (isUserInteractingRef.current) return;
    activityTimerRef.current = setTimeout(() => {
      activityTimerRef.current = null;
      setIsRemoteActive(false);
    }, timeoutRef.current);
  }, []);

  // Reset the activity timer (for single presses)
  const resetActivityTimer = useCallback(() => {
    setIsRemoteActive(true);
    scheduleHide();
  }, [scheduleHide]);

  // Start continuous activity (for holds/seeks)
  const startContinuousActivity = useCallback(() => {
    isUserInteractingRef.current = true;
    setIsUserInteracting(true);
    setIsRemoteActive(true);
    if (activityTimerRef.current) {
      clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;
    }
  }, []);

  // Stop continuous activity
  const stopContinuousActivity = useCallback(() => {
    isUserInteractingRef.current = false;
    setIsUserInteracting(false);
    setIsRemoteActive(true);
    scheduleHide();
  }, [scheduleHide]);

  // Arm the initial hide, and guarantee the pending timer dies with the
  // provider.
  useEffect(() => {
    scheduleHide();
    return () => {
      if (activityTimerRef.current) {
        clearTimeout(activityTimerRef.current);
        activityTimerRef.current = null;
      }
    };
  }, [scheduleHide]);

  // Play/pause handler registration
  const registerPlayPauseHandler = useCallback((handler: () => void) => {
    playPauseHandlerRef.current = handler;
  }, []);

  const unregisterPlayPauseHandler = useCallback(() => {
    playPauseHandlerRef.current = null;
  }, []);

  // Seek (rewind/fast-forward) handler registration
  const registerSeekHandler = useCallback(
    (handler: (seconds: number) => void) => {
      seekHandlerRef.current = handler;
    },
    [],
  );

  const unregisterSeekHandler = useCallback(() => {
    seekHandlerRef.current = null;
  }, []);

  // Listen for TV remote control events using React Native's useTVEventHandler.
  // The callback is memoized with stable deps on purpose: useTVEventHandler
  // keys its effect on the handler identity, so an inline arrow would remove
  // and re-add the native key subscription on every provider render.
  const handleTVEvent = useCallback(
    (event: HWEvent) => {
      if (!event) return;

      const { eventType, eventKeyAction } = event;

      // Gated: this fires on key-down, key-up AND every OS auto-repeat while a
      // direction is held. In a dev build each console call is formatted and
      // pushed over the Metro websocket synchronously on the JS thread.
      if (DEBUG_REMOTE_ACTIVITY) {
        console.log(
          "[RemoteActivity] PROCESSING event:",
          eventType,
          eventKeyAction,
        );
      }
      // Reset activity timer for most events
      resetActivityTimer();

      // Handle play/pause event (fires on key up = 1).
      //
      // Android only: expo-video 57 builds a media3 MediaSession for every
      // player unconditionally (VideoPlayer.kt — expo-video 3.x, on SDK 54,
      // created none), and that session already claims
      // KEYCODE_MEDIA_PLAY_PAUSE and toggles ExoPlayer natively. Handling it
      // here as well toggled twice, so the remote's play/pause button paused
      // and instantly resumed. Apple has no equivalent session for the Siri
      // Remote's button, so tvOS still needs the JS path.
      if (
        eventType === "playPause" &&
        eventKeyAction === 1 &&
        Platform.OS !== "android"
      ) {
        if (playPauseHandlerRef.current) {
          playPauseHandlerRef.current();
        }
      }

      // Handle rewind/fast-forward events (skip 10s on key up)
      if (eventType === "rewind" && eventKeyAction === 1) {
        if (seekHandlerRef.current) {
          seekHandlerRef.current(-10);
        }
      }
      if (eventType === "fastForward" && eventKeyAction === 1) {
        if (seekHandlerRef.current) {
          seekHandlerRef.current(10);
        }
      }

      // Handle long press events (seeking)
      if (eventType === "longLeft" || eventType === "longRight") {
        if (eventKeyAction === 0) {
          // Long press started
          if (!isUserInteractingRef.current) {
            startContinuousActivity();
          }
        } else {
          // Long press ended
          if (isUserInteractingRef.current) {
            stopContinuousActivity();
          }
        }
      }
    },
    [resetActivityTimer, startContinuousActivity, stopContinuousActivity],
  );

  useTVEventHandler(handleTVEvent);

  // Memoized so a provider re-render (only when the flags actually change now)
  // doesn't cascade into every useRemoteActivity consumer.
  const value = useMemo(
    () => ({
      isRemoteActive,
      isUserInteracting,
      resetActivityTimer,
      startContinuousActivity,
      stopContinuousActivity,
      registerPlayPauseHandler,
      unregisterPlayPauseHandler,
      registerSeekHandler,
      unregisterSeekHandler,
    }),
    [
      isRemoteActive,
      isUserInteracting,
      resetActivityTimer,
      startContinuousActivity,
      stopContinuousActivity,
      registerPlayPauseHandler,
      unregisterPlayPauseHandler,
      registerSeekHandler,
      unregisterSeekHandler,
    ],
  );

  return (
    <RemoteActivityContext.Provider value={value}>
      {children}
    </RemoteActivityContext.Provider>
  );
};

export const useRemoteActivity = () => {
  const context = useContext(RemoteActivityContext);
  if (!context) {
    throw new Error(
      "useRemoteActivity must be used within RemoteActivityProvider",
    );
  }
  return context;
};
