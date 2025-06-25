/**
 * Hook to track scroll velocity for aggressive prefetching
 */
import { useCallback, useRef, useState } from "react";
import { NativeSyntheticEvent, NativeScrollEvent } from "react-native";

interface ScrollVelocityData {
  velocity: number;
  direction: "left" | "right" | "idle";
  isHighVelocity: boolean;
  prefetchDistance: number;
}

export function useScrollVelocityTracker() {
  const [velocityData, setVelocityData] = useState<ScrollVelocityData>({
    velocity: 0,
    direction: "idle",
    isHighVelocity: false,
    prefetchDistance: 1,
  });

  const lastScrollX = useRef(0);
  const lastTimestamp = useRef(Date.now());
  const velocityHistory = useRef<number[]>([]);

  const trackScrollVelocity = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const currentScrollX = event.nativeEvent.contentOffset.x;
      const currentTime = Date.now();

      const deltaX = currentScrollX - lastScrollX.current;
      const deltaTime = currentTime - lastTimestamp.current;

      if (deltaTime > 0) {
        const instantVelocity = Math.abs(deltaX) / deltaTime;

        // Keep a rolling average of velocity
        velocityHistory.current.push(instantVelocity);
        if (velocityHistory.current.length > 5) {
          velocityHistory.current.shift();
        }

        const avgVelocity =
          velocityHistory.current.reduce((sum, v) => sum + v, 0) /
          velocityHistory.current.length;

        // Determine direction
        const direction =
          Math.abs(deltaX) < 1 ? "idle" : deltaX > 0 ? "right" : "left";

        // Classify velocity levels and determine prefetch distance
        const isHighVelocity = avgVelocity > 2; // Adjust threshold as needed
        const isUltraHighVelocity = avgVelocity > 5;

        let prefetchDistance = 1;
        if (isUltraHighVelocity) {
          prefetchDistance = 5; // Ultra-aggressive for very fast scrolling
        } else if (isHighVelocity) {
          prefetchDistance = 3; // Aggressive for fast scrolling
        } else if (avgVelocity > 0.5) {
          prefetchDistance = 2; // Moderate for medium scrolling
        }

        setVelocityData({
          velocity: avgVelocity,
          direction,
          isHighVelocity,
          prefetchDistance,
        });
      }

      lastScrollX.current = currentScrollX;
      lastTimestamp.current = currentTime;
    },
    [],
  );

  return {
    velocityData,
    trackScrollVelocity,
  };
}
