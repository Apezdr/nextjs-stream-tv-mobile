import { useIsFocused } from "expo-router/react-navigation";
import { useVideoPlayer, VideoPlayer } from "expo-video";
import { useRef, useEffect, useCallback, useState } from "react";
import { AppState, AppStateStatus } from "react-native";

interface SavedPlayerState {
  url: string;
  currentTime: number;
  isPlaying: boolean;
}

// ---- DIAGNOSTICS ---------------------------------------------------------
// Flip to `__DEV__` to trace source loading (which URL the player was asked
// for, which one it actually holds, and when the source is stripped). Off by
// default; pairs with DEBUG_BANNER in TVBanner. Filter both with:
//   adb logcat -s ReactNativeJS | grep -E "BannerDbg|PlayerDbg"
const DEBUG_PLAYER = __DEV__ && false;

function shortURL(url: string | null | undefined): string | null {
  if (!url) return null;
  const noQuery = url.split("?")[0];
  return `…${noQuery.slice(-28)}`;
}

function pdbg(event: string, data?: Record<string, unknown>) {
  if (!DEBUG_PLAYER) return;
  console.log(`[PlayerDbg] ${event}${data ? " " + JSON.stringify(data) : ""}`);
}

export function useOptimizedVideoPlayer(
  videoURL: string | null,
  onPlayerSetup?: (player: VideoPlayer) => void,
  deferSetup?: boolean,
) {
  const isFocused = useIsFocused();

  // Pin the URL passed to expo-video's `useVideoPlayer` to the FIRST resolved
  // URL for this mount. Internally `useVideoPlayer` releases the old player
  // and creates a new one whenever the source string changes (its deps are
  // `[JSON.stringify(parsedSource)]`). When the watch page's seamless episode
  // switch updates `effectiveVideoURL` after calling `player.replaceAsync`,
  // that change would otherwise trigger a release while VideoView is still
  // mounted with a stale `player` prop, crashing React Fabric dev-mode prop
  // diffing with "Cannot use shared object that was already released" on
  // `audioMixingMode`. By keeping the source argument stable, the player
  // instance is reused across in-session source swaps and the caller is
  // expected to use `player.replaceAsync()` for source changes (which the
  // watch page already does for episode switches).
  const pinnedSourceRef = useRef<string | null>(null);
  if (pinnedSourceRef.current === null && videoURL) {
    pinnedSourceRef.current = videoURL;
  }
  const pinnedSource = pinnedSourceRef.current;

  // Use the original useVideoPlayer - conditionally apply onPlayerSetup
  const player = useVideoPlayer(
    pinnedSource,
    deferSetup ? undefined : onPlayerSetup,
  );

  // Source bookkeeping.
  //
  // `pinnedSource` above is ONLY the argument handed to `useVideoPlayer`. It
  // has to stay stable (see the comment above) or the player is released
  // mid-mount and Fabric crashes — but it says nothing about what the player
  // actually holds once anyone calls `replaceAsync`.
  //
  // The guards this replaces conflated those two facts and were never cleared,
  // not even after `replaceAsync(null)`: `videoURL === pinnedSource` plus a
  // `lastReplacedURLRef` that nothing ever reset. Both are one-way latches, so
  // once a source had been stripped the pinned URL could never be loaded again
  // for the life of the mount, and the last-replaced URL could not be reloaded
  // either. For the TV banner that meant item 0 and the item interrupted by the
  // screensaver became permanently unloadable, and since readiness is signalled
  // by an EDGE-triggered statusChange, a player that never reloads never
  // announces itself — the banner parked forever and only an app restart fixed
  // it.
  //
  // Two refs now, because "what I asked for" and "what the player holds" are
  // genuinely different facts:
  //   requestedSourceRef — dedupe only; set BEFORE the call so a re-render
  //     mid-flight cannot issue the same replace twice.
  //   loadedSourceRef    — set only once `replaceAsync` RESOLVES, i.e. the
  //     player really holds it. Published as state so callers can safely
  //     level-check `player.status`. Marking it early would defeat the whole
  //     point: a stale but still-ready previous clip would read as ready for
  //     the URL that was only just requested.
  const requestedSourceRef = useRef<string | null>(null);
  const loadedSourceRef = useRef<string | null>(null);
  const [loadedSource, setLoadedSourceState] = useState<string | null>(null);
  const markLoadedSource = useCallback((url: string | null) => {
    loadedSourceRef.current = url;
    setLoadedSourceState((prev) => (prev === url ? prev : url));
  }, []);

  // `useVideoPlayer` loads `pinnedSource` itself whenever it (re)creates the
  // player, with no `replaceAsync` from us — so record it as both requested and
  // loaded. MUST be declared before the drift effect below: effects fire in
  // declaration order, so both refs are already correct when the drift effect
  // runs in the same commit and would otherwise issue a redundant replace.
  useEffect(() => {
    if (player && pinnedSource) {
      requestedSourceRef.current = pinnedSource;
      markLoadedSource(pinnedSource);
    }
  }, [player, pinnedSource, markLoadedSource]);

  // If the caller's `videoURL` changes after the player was created (e.g.
  // params drift catching up after `router.setParams` during episode
  // switching), swap the source via `replaceAsync` on the SAME player.
  useEffect(() => {
    if (!player || !videoURL) {
      pdbg("DRIFT-SKIP", {
        reason: !player ? "no-player" : "no-url",
        requested: shortURL(requestedSourceRef.current),
        loaded: shortURL(loadedSourceRef.current),
      });
      return;
    }
    if (videoURL === requestedSourceRef.current) {
      // If this fires repeatedly while the banner is frozen, the dedupe is
      // wrongly suppressing a reload the player actually needs.
      pdbg("DRIFT-SKIP", {
        reason: "already-requested",
        url: shortURL(videoURL),
        loaded: shortURL(loadedSourceRef.current),
      });
      return;
    }
    pdbg("DRIFT-REPLACE", {
      url: shortURL(videoURL),
      prevRequested: shortURL(requestedSourceRef.current),
    });
    requestedSourceRef.current = videoURL;
    player
      .replaceAsync({ uri: videoURL })
      .then(() => {
        // Only NOW does the player actually hold this source.
        pdbg("DRIFT-RESOLVED", {
          url: shortURL(videoURL),
          stillCurrent: requestedSourceRef.current === videoURL,
        });
        if (requestedSourceRef.current === videoURL) {
          markLoadedSource(videoURL);
        }
      })
      .catch((err) => {
        pdbg("DRIFT-FAILED", { url: shortURL(videoURL), err: String(err) });
        // Un-mark so the SAME url can be attempted again later. Never leave a
        // failed load looking like a successful one.
        if (requestedSourceRef.current === videoURL) {
          requestedSourceRef.current = null;
          markLoadedSource(null);
        }
        console.warn(
          "[useOptimizedVideoPlayer] replaceAsync for URL drift failed:",
          err,
        );
      });
    // `loadedSource` is a dep so that any reset of the marker (a strip, or a
    // failed load) re-evaluates whether this URL needs reloading. The
    // requestedSourceRef dedupe above makes the extra runs free.
  }, [player, videoURL, loadedSource, markLoadedSource]);

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
    if (!player) return;

    // Fall back to whatever the player is actually holding. `videoURL` is
    // frequently already null by the time we get here (TVBanner nulls its clip
    // URL in the very commit that blurs the screen), and the old `!videoURL`
    // bail then left the previous clip loaded AND still `readyToPlay` — which,
    // with an edge-triggered statusChange, is a player that can never announce
    // itself again.
    const sourceURL = videoURL ?? loadedSourceRef.current;
    pdbg("CLEANUP-ENTER", {
      videoURL: shortURL(videoURL),
      loaded: shortURL(loadedSourceRef.current),
      willStrip: !!sourceURL,
    });
    if (!sourceURL) return;

    // Increment operation ID to invalidate any concurrent operations
    const currentOpId = ++opIdRef.current;

    try {
      // Safely read current state before cleanup
      const { currentTime, isPlaying } = safeGetPlayerState(player);

      // Only save a resume point the caller can actually use. When `videoURL`
      // is already null the caller has moved on — the banner rotates, it does
      // not resume — and writing savedState here would arm restore() to seek
      // that clip back to its pre-screensaver position the next time the URL
      // came round, racing the fresh playback and skipping the clip.
      savedState.current = videoURL
        ? { url: videoURL, currentTime, isPlaying }
        : null;

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
      const strippedRequest = requestedSourceRef.current;
      await player.replaceAsync(null);

      // The player holds nothing now, so ANY url may be loaded again —
      // including the one just stripped and the pinned mount-time one. Skip it
      // if a newer replace was requested while we awaited, or we would null out
      // bookkeeping that describes a different source.
      const cleared = requestedSourceRef.current === strippedRequest;
      if (cleared) {
        requestedSourceRef.current = null;
        markLoadedSource(null);
      }

      pdbg("CLEANUP-STRIPPED", {
        cleared,
        savedState: savedState.current
          ? shortURL(savedState.current.url)
          : null,
      });
    } catch (error) {
      console.log("[useOptimizedVideoPlayer] Error freeing resources:", error);
    }
    // Reads loadedSourceRef/requestedSourceRef as REFS and markLoadedSource is
    // ([])-stable, so this callback's identity does not change when
    // `loadedSource` updates. Deliberate: the focus effect keys on it.
  }, [player, videoURL, safeGetPlayerState, markLoadedSource]);

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
      requestedSourceRef.current = videoURL;
      markLoadedSource(videoURL);

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
  }, [player, videoURL, markLoadedSource]);

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

  // Only manage resources on focus transitions, but skip during PiP mode.
  // The hasRunFocusEffectRef gate prevents the cleanup branch from firing
  // on initial mount: `useIsFocused()` legitimately returns false until
  // React Navigation finishes mounting the screen, and running cleanup
  // during that window tears down resources before the screen is ever
  // visible.
  const hasRunFocusEffectRef = useRef(false);
  useEffect(() => {
    pdbg("FOCUS-EFFECT", {
      isFocused,
      first: !hasRunFocusEffectRef.current,
      hasSaved: !!savedState.current,
      pip: isPiPModeRef.current,
      videoURL: shortURL(videoURL),
      loaded: shortURL(loadedSourceRef.current),
      branch: !hasRunFocusEffectRef.current
        ? "first-run"
        : !isFocused
          ? isPiPModeRef.current
            ? "skip-cleanup-pip"
            : "cleanup"
          : savedState.current && !isPiPModeRef.current
            ? "restore"
            : "none",
    });
    if (!hasRunFocusEffectRef.current) {
      hasRunFocusEffectRef.current = true;
      // On the very first run, only act on the focused-true case (a normal
      // mount) and skip the unfocused-cleanup branch entirely.
      if (isFocused && savedState.current && !isPiPModeRef.current) {
        console.log(
          "[useOptimizedVideoPlayer] Screen focused - restoring resources",
        );
        restore();
      }
      return;
    }

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

  // Tell the hook that the CALLER replaced the source itself (the watch pages
  // do this for seamless episode switching). Without it the drift effect sees a
  // URL the player already holds, issues a second redundant replaceAsync, and
  // that reload discards both the resume position and the selected audio track.
  const notifySourceReplaced = useCallback(
    (url: string | null) => {
      requestedSourceRef.current = url;
      markLoadedSource(url);
    },
    [markLoadedSource],
  );

  // `loadedSource` is the URL the player currently holds (null when stripped).
  // Compare it to your requested URL before trusting `player.status`: an
  // already-`readyToPlay` player emits no statusChange, so a level check is the
  // only way to observe readiness you missed — but only once the player really
  // holds YOUR source, or a stale ready clip reads as ready.
  return {
    player,
    isFocused,
    setupPlayer,
    loadedSource,
    notifySourceReplaced,
  };
}
