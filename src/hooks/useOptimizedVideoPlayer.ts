import { useIsFocused } from "@react-navigation/native";
import { useVideoPlayer, VideoPlayer } from "expo-video";
import { useRef, useEffect, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";

interface SavedPlayerState {
  url: string;
  currentTime: number;
  isPlaying: boolean;
}

export function useOptimizedVideoPlayer(
  videoURL: string | null,
  onPlayerSetup?: (player: VideoPlayer) => void,
  deferSetup?: boolean,
) {
  const isFocused = useIsFocused();

  // Use the original useVideoPlayer - conditionally apply onPlayerSetup
  const player = useVideoPlayer(
    videoURL,
    deferSetup ? undefined : onPlayerSetup,
  );

  // Track the saved state when we clean up
  const savedState = useRef<SavedPlayerState | null>(null);

  // Operation ID to guard against rapid focus flips
  const opIdRef = useRef(0);

  // Track PiP state to avoid unnecessary cleanup/restore cycles
  const isPiPModeRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  // Safely read player properties with defensive fallbacks
  const safeGetPlayerState = useCallback((player: VideoPlayer) => {
    try {
      const t = player.currentTime;
      const currentTime = Number.isFinite(t) ? t : 0;
      const isPlaying = Boolean(player.playing);
      return { currentTime, isPlaying };
    } catch (error) {
      console.log(
        "[useOptimizedVideoPlayer] Error reading player state:",
        error,
      );
      return {
        currentTime: 0,
        isPlaying: false,
      };
    }
  }, []);

  const cleanup = useCallback(async () => {
    if (!player || !videoURL) return;

    // Increment operation ID to invalidate any concurrent operations
    const currentOpId = ++opIdRef.current;

    try {
      // Safely read current state before cleanup
      const { currentTime, isPlaying } = safeGetPlayerState(player);

      savedState.current = {
        url: videoURL,
        currentTime,
        isPlaying,
      };

      console.log(
        `[useOptimizedVideoPlayer] Saving state before cleanup - Time: ${currentTime}s, Playing: ${isPlaying}`,
      );

      // Pause first to help playback tracker flush final update
      try {
        // Await pause if it returns a Promise to ensure playingChange handlers run
        await Promise.resolve(player.pause());
      } catch (error) {
        console.log("[useOptimizedVideoPlayer] Error pausing:", error);
      }

      // Check if a newer operation started
      if (opIdRef.current !== currentOpId) {
        console.log(
          "[useOptimizedVideoPlayer] Cleanup cancelled by newer operation",
        );
        return;
      }

      // Free the video resources
      await player.replaceAsync(null);

      console.log(
        "[useOptimizedVideoPlayer] Freed video resources on focus loss",
      );
    } catch (error) {
      console.log("[useOptimizedVideoPlayer] Error freeing resources:", error);
    }
  }, [player, videoURL, safeGetPlayerState]);

  const restore = useCallback(async () => {
    if (!player || !videoURL) return;

    // Only restore if we have saved state for this URL
    if (!savedState.current || savedState.current.url !== videoURL) {
      console.log(
        "[useOptimizedVideoPlayer] No saved state to restore or URL mismatch",
      );
      return;
    }

    // Increment operation ID to invalidate any concurrent operations
    const currentOpId = ++opIdRef.current;

    try {
      const { currentTime, isPlaying } = savedState.current;

      console.log(
        `[useOptimizedVideoPlayer] Restoring video - Time: ${currentTime}s, Playing: ${isPlaying}`,
      );

      // Restore the video source
      await player.replaceAsync({ uri: videoURL });

      // Check if a newer operation started
      if (opIdRef.current !== currentOpId) {
        console.log(
          "[useOptimizedVideoPlayer] Restore cancelled by newer operation",
        );
        return;
      }

      // Wait for the video to be ready before seeking
      await new Promise<void>((resolve) => {
        let cleared = false;

        const statusListener = player.addListener("statusChange", (status) => {
          if (status?.status === "readyToPlay" && !status?.error) {
            if (!cleared) {
              cleared = true;
              try {
                statusListener.remove();
              } catch (error) {
                console.log(
                  "[useOptimizedVideoPlayer] Error removing status listener:",
                  error,
                );
              }
              clearTimeout(timeoutId);
              resolve();
            }
          }
        });

        // Timeout fallback in case status never changes
        const timeoutId = setTimeout(() => {
          if (!cleared) {
            cleared = true;
            try {
              statusListener.remove();
            } catch (error) {
              console.log(
                "[useOptimizedVideoPlayer] Error removing status listener:",
                error,
              );
            }
            resolve();
          }
        }, 2000);
      });

      // Check again if a newer operation started
      if (opIdRef.current !== currentOpId) {
        console.log(
          "[useOptimizedVideoPlayer] Restore cancelled after waiting for ready",
        );
        return;
      }

      // Restore the playback position with a small cushion
      if (currentTime > 0) {
        const resumeTime = Math.max(0, currentTime - 2);
        console.log(
          `[useOptimizedVideoPlayer] Seeking to ${resumeTime}s (saved: ${currentTime}s)`,
        );

        try {
          player.currentTime = resumeTime;
        } catch (error) {
          console.log("[useOptimizedVideoPlayer] Error seeking:", error);
        }
      }

      // Resume playback if it was playing before
      if (isPlaying) {
        try {
          player.play();
        } catch (error) {
          console.log(
            "[useOptimizedVideoPlayer] Error resuming playback:",
            error,
          );
        }
      }

      console.log(
        "[useOptimizedVideoPlayer] Restored video resources on focus gain",
      );

      // Clear the saved state
      savedState.current = null;
    } catch (error) {
      console.log(
        "[useOptimizedVideoPlayer] Error restoring resources:",
        error,
      );
    }
  }, [player, videoURL]);

  // Handle URL changes - clear saved state
  useEffect(() => {
    if (videoURL) {
      // If the URL changed while we have saved state for a different URL, clear it
      if (savedState.current && savedState.current.url !== videoURL) {
        console.log(
          "[useOptimizedVideoPlayer] URL changed, clearing saved state",
        );
        savedState.current = null;
      }
    } else {
      // No URL, clear everything
      savedState.current = null;
    }
  }, [videoURL]);

  // Track app state changes to detect PiP mode
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextAppState;

      // Detect potential PiP transitions
      if (
        previousState === "active" &&
        (nextAppState === "background" || nextAppState === "inactive")
      ) {
        // App going to background - might be PiP activation
        // Set a flag and clear it after a delay to detect if we stay backgrounded (real background)
        // vs quickly return to active (PiP mode)
        isPiPModeRef.current = true;

        setTimeout(() => {
          if (appStateRef.current === "active") {
            // We came back to active quickly, likely PiP mode
            console.log(
              "[useOptimizedVideoPlayer] Detected PiP mode transition",
            );
          } else {
            // Still backgrounded, not PiP
            isPiPModeRef.current = false;
          }
        }, 500); // 500ms delay to detect quick transitions
      } else if (nextAppState === "active") {
        // Coming back to foreground
        setTimeout(() => {
          isPiPModeRef.current = false;
        }, 100);
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription?.remove();
  }, []);

  // Only manage resources on focus transitions, but skip during PiP mode
  useEffect(() => {
    if (!isFocused) {
      // Don't cleanup if we're likely in PiP mode
      if (!isPiPModeRef.current) {
        console.log(
          "[useOptimizedVideoPlayer] Screen unfocused - cleaning up resources",
        );
        cleanup();
      } else {
        console.log(
          "[useOptimizedVideoPlayer] Screen unfocused but likely PiP mode - skipping cleanup",
        );
      }
    } else if (savedState.current && !isPiPModeRef.current) {
      // Only restore if we previously cleaned up and we're not coming back from PiP
      console.log(
        "[useOptimizedVideoPlayer] Screen focused - restoring resources",
      );
      restore();
    } else if (isPiPModeRef.current) {
      console.log(
        "[useOptimizedVideoPlayer] Screen focused from PiP mode - skipping restore",
      );
    }
  }, [isFocused, cleanup, restore]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      savedState.current = null;
      opIdRef.current = 0;
      isPiPModeRef.current = false;
    };
  }, []);

  // Manual setup function for deferred setup
  const setupPlayer = useCallback(
    (setupCallback?: (player: VideoPlayer) => void) => {
      if (player && setupCallback) {
        setupCallback(player);
      }
    },
    [player],
  );

  return { player, isFocused, setupPlayer };
}
