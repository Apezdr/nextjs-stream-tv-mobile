import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
  useCallback,
} from "react";
import { useTVEventHandler } from "react-native";

interface RemoteActivityContextType {
  isRemoteActive: boolean;
  isUserInteracting: boolean; // New: tracks continuous interaction
  resetActivityTimer: () => void;
  startContinuousActivity: () => void; // New: for hold/seek
  stopContinuousActivity: () => void; // New: when releasing
}

const RemoteActivityContext = createContext<RemoteActivityContextType | null>(
  null,
);

// Timeout for hiding controls after no activity
const REMOTE_ACTIVITY_TIMEOUT = 5000; // 5 seconds
// Shorter timeout when user is actively interacting (holding/seeking)
const CONTINUOUS_ACTIVITY_TIMEOUT = 500; // 500ms

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
  const activityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const continuousTimerRef = useRef<NodeJS.Timeout | null>(null);
  const timeout = customTimeout || REMOTE_ACTIVITY_TIMEOUT;

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (activityTimerRef.current) {
      clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;
    }
    if (continuousTimerRef.current) {
      clearInterval(continuousTimerRef.current);
      continuousTimerRef.current = null;
    }
  }, []);

  // Reset the activity timer (for single presses)
  const resetActivityTimer = useCallback(() => {
    clearTimers();

    setIsRemoteActive(true);

    // Don't set timeout if user is continuously interacting
    if (!isUserInteracting) {
      activityTimerRef.current = setTimeout(() => {
        setIsRemoteActive(false);
        console.log("[RemoteActivity] Remote inactive due to timeout");
      }, timeout);
    }
  }, [clearTimers, timeout, isUserInteracting]);

  // Start continuous activity (for holds/seeks)
  const startContinuousActivity = useCallback(() => {
    console.log("[RemoteActivity] Starting continuous activity");
    clearTimers();

    setIsRemoteActive(true);
    setIsUserInteracting(true);

    // Keep activity alive with shorter checks while interacting
    continuousTimerRef.current = setInterval(() => {
      console.log("[RemoteActivity] Continuous activity pulse");
      setIsRemoteActive(true);
    }, CONTINUOUS_ACTIVITY_TIMEOUT);
  }, [clearTimers]);

  // Stop continuous activity
  const stopContinuousActivity = useCallback(() => {
    console.log("[RemoteActivity] Stopping continuous activity");
    setIsUserInteracting(false);

    if (continuousTimerRef.current) {
      clearInterval(continuousTimerRef.current);
      continuousTimerRef.current = null;
    }

    // Start normal timeout after continuous activity ends
    resetActivityTimer();
  }, [resetActivityTimer]);

  // Listen for TV remote control events using React Native's useTVEventHandler
  useTVEventHandler((event) => {
    if (!event) return;

    const { eventType, eventKeyAction } = event;

    console.log(
      "[RemoteActivity] ✅ PROCESSING event:",
      eventType,
      eventKeyAction,
    );
    // Reset activity timer for most events
    resetActivityTimer();

    // Handle long press events (seeking)
    if (eventType === "longLeft" || eventType === "longRight") {
      if (eventKeyAction === 0) {
        // Long press started
        if (!isUserInteracting) {
          startContinuousActivity();
        }
      } else {
        // Long press ended
        if (isUserInteracting) {
          stopContinuousActivity();
        }
      }
    }
  });

  // Initial activity setup
  useEffect(() => {
    resetActivityTimer();

    return () => {
      clearTimers();
    };
  }, [resetActivityTimer, clearTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const value = {
    isRemoteActive,
    isUserInteracting,
    resetActivityTimer,
    startContinuousActivity,
    stopContinuousActivity,
  };

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
