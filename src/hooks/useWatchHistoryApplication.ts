import { VideoPlayer } from "expo-video";
import { useCallback, useRef, useState, useEffect } from "react";

import { MediaDetailsResponse } from "@/src/data/types/content.types";
import { applyResumePosition } from "@/src/utils/resumeGuard";

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
  /**
   * Tell the hook the caller has already seeked the player for this content
   * (the seamless episode switch applies its own resume position). The hook
   * then treats the identity as applied: no second seek when the content
   * loader refetches the same episode moments later, and the controls stay
   * up through that refetch.
   */
  markApplied: (videoData: MediaDetailsResponse) => void;
  isControlsReady: boolean;
}

/**
 * What "the same content" means for resume purposes. The stream URL is
 * unique per episode / movie; the tuple is the fallback for a payload
 * without one.
 */
function identityOf(videoData: MediaDetailsResponse | null): string | null {
  if (!videoData) return null;
  if (videoData.videoURL) return videoData.videoURL;
  return [
    videoData.type,
    videoData.id,
    videoData.seasonNumber,
    videoData.episodeNumber,
  ].join(":");
}

export function useWatchHistoryApplication({
  player,
  videoData,
  contentLoading,
}: UseWatchHistoryApplicationParams): UseWatchHistoryApplicationReturn {
  const [status, setStatus] = useState<WatchHistoryStatus>("loading");
  // The identity the resume position was last applied for, and how it went.
  // Keyed by identity rather than a boolean so a loader refetch of the SAME
  // episode (the 150 ms post-switch refetch, a focus refresh) does not reset
  // and re-seek — that was the visible jump-back after every episode switch.
  const appliedRef = useRef<{
    key: string;
    status: "success" | "failed";
  } | null>(null);
  const resumeGuardRef = useRef<(() => void) | null>(null);

  // Track content changes
  useEffect(() => {
    const key = identityOf(videoData);
    const applied = appliedRef.current;

    if (key && applied?.key === key) {
      // Already applied for exactly this content: keep the controls up even
      // while the loader refetches it.
      setStatus((current) =>
        current === applied.status ? current : applied.status,
      );
      return;
    }

    if (contentLoading) {
      setStatus("loading");
    } else if (videoData) {
      setStatus("ready");
    }
  }, [contentLoading, videoData]);

  const applyWatchHistory = useCallback(async () => {
    const key = identityOf(videoData);
    if (!player || !videoData || !key || appliedRef.current?.key === key) {
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

        // Seek, and keep the seek alive across the source commit: expo-video
        // attaches the source asynchronously, and a seek that lands before
        // the media item is set is reset away (playback from zero, and the
        // heartbeat then overwrites the saved position). See resumeGuard.
        resumeGuardRef.current?.();
        resumeGuardRef.current = applyResumePosition(
          player,
          resumeTime,
          "useWatchHistoryApplication",
        );

        // Small delay to let the seek complete before marking as success
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        console.log(
          "[useWatchHistoryApplication] No watch history found, starting from beginning",
        );
      }

      appliedRef.current = { key, status: "success" };
      setStatus("success");

      console.log(
        "[useWatchHistoryApplication] Watch history application completed successfully",
      );
    } catch (error) {
      console.error(
        "[useWatchHistoryApplication] Error applying watch history:",
        error,
      );
      appliedRef.current = { key, status: "failed" }; // Don't retry
      setStatus("failed");
    }
  }, [player, videoData]);

  const markApplied = useCallback((data: MediaDetailsResponse) => {
    const key = identityOf(data);
    if (!key) return;
    appliedRef.current = { key, status: "success" };
    setStatus("success");
  }, []);

  // Auto-apply when ready
  useEffect(() => {
    if (status === "ready" && player && videoData) {
      applyWatchHistory();
    }
  }, [status, player, videoData, applyWatchHistory]);

  useEffect(() => () => resumeGuardRef.current?.(), []);

  const isControlsReady = status === "success" || status === "failed";

  return {
    status,
    applyWatchHistory,
    markApplied,
    isControlsReady,
  };
}
