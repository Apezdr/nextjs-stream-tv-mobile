/**
 * Smart infinite scroll hook that predicts when the user will reach the end
 * of a list based on scroll velocity, and triggers load-more early enough
 * to keep the experience seamless.
 *
 * Uses a rolling average velocity (5-sample window) to smooth out jitter,
 * then computes ETA to end-of-content. If ETA drops below `predictAheadMs`,
 * the load is triggered — even if `onEndReached` hasn't fired yet.
 * `onEndReached` remains as a guaranteed fallback.
 */
import { useCallback, useEffect, useRef } from "react";
import { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

interface SmartInfiniteScrollOptions {
  hasNextPage: boolean | undefined;
  isFetching: boolean;
  onLoadMore: () => void;
  /** true for horizontal FlashList rows, false for vertical grids */
  horizontal?: boolean;
  /**
   * Fire load-more when ETA to end drops below this value (ms).
   * Higher = more eager prefetch. Default 800ms.
   */
  predictAheadMs?: number;
  /**
   * Fallback static threshold passed to onEndReachedThreshold.
   * Acts as a safety net when velocity is low. Default 0.5.
   */
  endReachedThreshold?: number;
}

interface SmartInfiniteScrollResult {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
  onEndReached: () => void;
  onEndReachedThreshold: number;
}

export function useSmartInfiniteScroll({
  hasNextPage,
  isFetching,
  onLoadMore,
  horizontal = false,
  predictAheadMs = 800,
  endReachedThreshold = 0.5,
}: SmartInfiniteScrollOptions): SmartInfiniteScrollResult {
  // Rolling velocity history (px/ms), 5-sample window
  const velocityHistory = useRef<number[]>([]);
  const lastOffset = useRef(0);
  const lastTime = useRef(0);

  // Guard: prevent firing multiple times for the same inflight request
  const loadTriggeredRef = useRef(false);

  // Reset guard once the current fetch completes so the next threshold
  // crossing can trigger another load
  useEffect(() => {
    if (!isFetching) {
      loadTriggeredRef.current = false;
    }
  }, [isFetching]);

  const triggerLoad = useCallback(() => {
    if (hasNextPage && !isFetching && !loadTriggeredRef.current) {
      loadTriggeredRef.current = true;
      onLoadMore();
    }
  }, [hasNextPage, isFetching, onLoadMore]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;

      const offset = horizontal ? contentOffset.x : contentOffset.y;
      const contentLength = horizontal ? contentSize.width : contentSize.height;
      const viewLength = horizontal
        ? layoutMeasurement.width
        : layoutMeasurement.height;

      // Distance remaining before end of content
      const distanceFromEnd = contentLength - offset - viewLength;

      // Nothing useful to compute yet
      if (distanceFromEnd <= 0 || contentLength <= viewLength) return;

      // --- Velocity tracking (rolling 5-sample average) ---
      const now = Date.now();
      if (lastTime.current > 0) {
        const dt = now - lastTime.current;
        if (dt > 0) {
          const instantVelocity = Math.abs(offset - lastOffset.current) / dt;
          velocityHistory.current.push(instantVelocity);
          if (velocityHistory.current.length > 5) {
            velocityHistory.current.shift();
          }
        }
      }
      lastOffset.current = offset;
      lastTime.current = now;

      // Need at least 2 samples before we can trust the average
      if (velocityHistory.current.length < 2) return;

      const avgVelocity =
        velocityHistory.current.reduce((sum, v) => sum + v, 0) /
        velocityHistory.current.length;

      // Not moving meaningfully
      if (avgVelocity < 0.05) return;

      // ETA in ms at current average velocity
      const etaMs = distanceFromEnd / avgVelocity;

      if (etaMs < predictAheadMs) {
        triggerLoad();
      }
    },
    [horizontal, predictAheadMs, triggerLoad],
  );

  return {
    onScroll: handleScroll,
    // 16ms throttle (~60fps) — required on iOS to receive frequent scroll events
    scrollEventThrottle: 16,
    onEndReached: triggerLoad,
    onEndReachedThreshold: endReachedThreshold,
  };
}
