import { VideoPlayer } from "expo-video";
import { useCallback, useRef, useState, useEffect } from "react";

import { MediaDetailsResponse } from "@/src/data/types/content.types";

export type WatchHistoryStatus =
  | "loading" // Waiting for content data
  | "ready" // Content loaded, ready to apply
  | "applying" // Applying watch history to player
  | "success" // Applied successfully, ready for interaction
  | "failed"; // Failed to apply, defaulting to 00:00

interface UseWatchHistoryApplicationParams {
  player: VideoPlayer | null;
  videoData: MediaDetailsResponse | null;
  contentLoading: boolean;
}

interface UseWatchHistoryApplicationReturn {
  status: WatchHistoryStatus;
  applyWatchHistory: () => Promise<void>;
  isControlsReady: boolean;
}

export function useWatchHistoryApplication({
  player,
  videoData,
  contentLoading,
}: UseWatchHistoryApplicationParams): UseWatchHistoryApplicationReturn {
  const [status, setStatus] = useState<WatchHistoryStatus>("loading");
  const hasAppliedRef = useRef(false);

  // Reset when content changes
  useEffect(() => {
    if (contentLoading) {
      setStatus("loading");
      hasAppliedRef.current = false;
    } else if (videoData && !hasAppliedRef.current) {
      setStatus("ready");
    }
  }, [contentLoading, videoData]);

  const applyWatchHistory = useCallback(async () => {
    if (!player || !videoData || hasAppliedRef.current) {
      return;
    }

    try {
      setStatus("applying");
      console.log(
        "[useWatchHistoryApplication] Applying watch history to player",
      );

      const watchHistory = videoData.watchHistory;

      if (watchHistory && watchHistory.playbackTime > 0) {
        // Apply saved position with a small buffer to account for seeking precision
        const resumeTime = Math.max(0, watchHistory.playbackTime - 2);

        console.log(
          `[useWatchHistoryApplication] Resuming playback from ${resumeTime}s (saved: ${watchHistory.playbackTime}s)`,
        );

        // Set the player position
        player.currentTime = resumeTime;

        // Small delay to let the seek complete before marking as success
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        console.log(
          "[useWatchHistoryApplication] No watch history found, starting from beginning",
        );
      }

      hasAppliedRef.current = true;
      setStatus("success");

      console.log(
        "[useWatchHistoryApplication] Watch history application completed successfully",
      );
    } catch (error) {
      console.error(
        "[useWatchHistoryApplication] Error applying watch history:",
        error,
      );
      hasAppliedRef.current = true; // Don't retry
      setStatus("failed");
    }
  }, [player, videoData]);

  // Auto-apply when ready
  useEffect(() => {
    if (status === "ready" && player && videoData) {
      applyWatchHistory();
    }
  }, [status, player, videoData, applyWatchHistory]);

  const isControlsReady = status === "success" || status === "failed";

  return {
    status,
    applyWatchHistory,
    isControlsReady,
  };
}
