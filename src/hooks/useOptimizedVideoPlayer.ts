import { useIsFocused } from "@react-navigation/native";
import { useVideoPlayer, VideoPlayer } from "expo-video";
import { useRef, useEffect, useCallback } from "react";

export function useOptimizedVideoPlayer(
  videoURL: string | null,
  onPlayerSetup?: (player: VideoPlayer) => void,
) {
  const isFocused = useIsFocused();

  // Use the original useVideoPlayer but make it focus-aware
  const player = useVideoPlayer(videoURL, onPlayerSetup);

  // Track the last URL we loaded
  const lastLoadedURL = useRef<string | null>(null);

  const cleanup = useCallback(async () => {
    if (!player) return;

    try {
      // Save what URL we had loaded
      lastLoadedURL.current = videoURL;

      // Just free the video resources, don't release the player
      await player.replaceAsync(null);
      console.log(
        "[useOptimizedVideoPlayer] Freed video resources on focus loss",
      );
    } catch (error) {
      console.log("[useOptimizedVideoPlayer] Error freeing resources:", error);
    }
  }, [player, videoURL]);

  const restore = useCallback(async () => {
    if (!player || !videoURL) return;

    try {
      // Only restore if we actually cleaned up and the URL is the same
      if (lastLoadedURL.current === videoURL) {
        await player.replaceAsync({ uri: videoURL });
        console.log(
          "[useOptimizedVideoPlayer] Restored video resources on focus gain",
        );
      }
      // Reset the tracking
      lastLoadedURL.current = null;
    } catch (error) {
      console.log(
        "[useOptimizedVideoPlayer] Error restoring resources:",
        error,
      );
    }
  }, [player, videoURL]);

  // Only manage resources on focus transitions, not URL changes
  useEffect(() => {
    if (!isFocused) {
      cleanup();
    } else if (lastLoadedURL.current) {
      // Only restore if we previously cleaned up
      restore();
    }
  }, [isFocused, cleanup, restore]);

  return { player, isFocused };
}
