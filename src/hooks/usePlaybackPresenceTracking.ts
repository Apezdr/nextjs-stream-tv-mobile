import * as Crypto from "expo-crypto";
import { VideoPlayer } from "expo-video";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

import {
  contentService,
  PlaybackUpdateKind,
  PlaybackUpdateRequest,
} from "@/src/data/services/contentService";
import { MediaDetailsResponse } from "@/src/data/types/content.types";
import { isResumePending } from "@/src/utils/resumeGuard";

const PLAYING_HEARTBEAT_INTERVAL_MS = 30_000;
const PAUSED_HEARTBEAT_INTERVAL_MS = 180_000;
// timeUpdate fires about once a second; a jump larger than this between two
// consecutive events is a seek, not playback. (The old rule compared against
// the last SENT position, so it tripped by itself after 11s of playback and
// the "30s" cadence was really 11s.)
const SEEK_JUMP_S = 5;
// A source swap (tier switch, retry, descent) can briefly report a position
// near zero before its resume seek lands. Persisting that would overwrite the
// saved position within seconds, so a sharp regression right after a swap is
// treated as transient; a genuine restart shows up again once the grace
// period is over. (The primary defence is `isResumePending`, which holds
// every write while a resume guard is armed; this catches swaps that re-seek
// without one.)
const SOURCE_SWAP_GRACE_MS = 20_000;
// Only a drop to the opening seconds counts: a backward seek into the middle
// of the title right after a swap is a real position and persists normally.
const NEAR_START_S = 60;

function parseNumericParam(value: string | undefined): number | undefined {
  if (!value || value === "") return undefined;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? undefined : parsed;
}

interface WatchParams {
  id: string;
  type: "tv" | "movie";
  season?: string;
  episode?: string;
}

function buildMediaMetadata(
  videoData: MediaDetailsResponse | null,
  params: WatchParams,
): PlaybackUpdateRequest["mediaMetadata"] | null {
  if (!videoData) return null;

  return {
    mediaType: videoData.type || params.type,
    mediaId: videoData.id || params.id,
    ...(params.type === "tv" && {
      showId: params.id,
      // `??`, not `||`: season 0 (specials) is a real season number.
      seasonNumber: videoData.seasonNumber ?? parseNumericParam(params.season),
      episodeNumber:
        videoData.episodeNumber ?? parseNumericParam(params.episode),
    }),
  };
}

/**
 * Shared playback + presence heartbeat tracking, used by both the TV and
 * mobile watch screens.
 *
 * Writes, by `kind`:
 * - `progress`: every 30s (wall-clock) while playing, immediately on a seek,
 *   and immediately on pause. Carries the position and the session id.
 * - `keepalive`: every 180s while paused (the presence "still here" ping).
 *   Carries NO position — a paused device must never drag the row back over
 *   progress made on another device meanwhile.
 * - `final`: the exit flush (`flushCurrentProgress({ includeSessionId:
 *   false })`, the unmount cleanup, backgrounding while paused). Carries the
 *   position and no session id, and is paired with `presence/end`.
 *
 * No position is written while a resume seek is pending on the player (see
 * `isResumePending`): right after any `replaceAsync` the new source reports
 * near-zero until the seek lands, and the server accepts anything ≥ 2s.
 *
 * The session id is minted per identity (`videoURL`) and cleared by
 * `endSession()`; a later resume mints a fresh one, so a paused-then-
 * backgrounded session that comes back gets a new presence row instead of
 * resurrecting the one it ended. `suspendTracking()` detaches everything for
 * the rest of a mount (exit) or until the identity changes (episode switch).
 */
export function usePlaybackPresenceTracking(
  player: VideoPlayer,
  videoData: MediaDetailsResponse | null,
  videoURL: string | null,
  routeParams: WatchParams,
) {
  // useLocalSearchParams() returns a NEW object every render. Depending on
  // it directly would re-create every callback each render, which re-runs
  // the listener effect each render — and every re-run leaves a 100 ms gap
  // with no listeners, long enough to lose the pause event that follows the
  // remote press that re-rendered the page. Key on the primitives instead.
  const params = useMemo<WatchParams>(
    () => ({
      id: routeParams.id,
      type: routeParams.type,
      season: routeParams.season,
      episode: routeParams.episode,
    }),
    [routeParams.id, routeParams.type, routeParams.season, routeParams.episode],
  );

  // Last position SENT (or accepted for sending) — the regression guard's
  // reference point.
  const lastUpdateTimeRef = useRef<number>(0);
  // Wall-clock of the last progress send while playing (the 30s cadence),
  // and the position seen on the previous timeUpdate (seek detection).
  const lastPlayingSendAtRef = useRef<number>(0);
  const lastObservedTimeRef = useRef<number | null>(null);
  // Wall-clock of the last successful position write, for callers that need
  // to know whether a server row is newer than anything this session sent.
  const lastSentAtRef = useRef<number>(0);
  const sourceChangedAtRef = useRef<number>(0);
  const updateIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedHeartbeatIntervalRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const listenersRef = useRef<{ remove: () => void }[]>([]);
  const isMountedRef = useRef(true);
  const pendingUpdateRef = useRef<Promise<void> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // The identity the current session id was minted for.
  const sessionVideoIdRef = useRef<string | null>(null);
  // The identity the listeners are attached for; a change resets the cadence
  // baseline so the old episode's position never feeds the new one's guard.
  const trackedVideoIdRef = useRef<string | null>(null);
  // Set by suspendTracking(): nothing is sent until the identity changes or
  // resumeTracking() is called. Holds the identity it was suspended for.
  const suspendedForRef = useRef<string | null | undefined>(undefined);
  const setupTrackingRef = useRef<(() => void) | null>(null);

  // Latest inputs for the cleanup-time flush (effect closures would be stale).
  const latestRef = useRef({ player, videoData, videoURL, params });
  latestRef.current = { player, videoData, videoURL, params };

  const isPlayerValid = useCallback((player: VideoPlayer | null): boolean => {
    if (!player) return false;

    try {
      // Try to access a property to check if the native object is still valid
      const _ = player.currentTime;
      return true;
    } catch {
      // If accessing the property throws, the native object has been released
      return false;
    }
  }, []);

  const isSuspended = useCallback(
    () => suspendedForRef.current !== undefined,
    [],
  );

  const stopPausedHeartbeat = useCallback(() => {
    if (pausedHeartbeatIntervalRef.current) {
      clearInterval(pausedHeartbeatIntervalRef.current);
      pausedHeartbeatIntervalRef.current = null;
    }
  }, []);

  // `lastSent` is passed explicitly and must be read BEFORE the caller
  // records the new position — comparing against a value that was just
  // overwritten with `currentTime` made this guard a no-op.
  const isTransientRegression = useCallback(
    (currentTime: number, lastSent: number) => {
      const sinceSwap = Date.now() - sourceChangedAtRef.current;
      if (sinceSwap > SOURCE_SWAP_GRACE_MS) return false;
      if (lastSent <= NEAR_START_S || currentTime >= NEAR_START_S) return false;
      console.log(
        `[PlaybackPresenceTracking] Skipping ${currentTime.toFixed(1)}s update ${Math.round(sinceSwap / 1000)}s after a source swap (last sent ${lastSent.toFixed(1)}s)`,
      );
      return true;
    },
    [],
  );

  // A position read while a resume seek is in flight is the NEW source's
  // pre-seek zero, not where the viewer is.
  const isPositionTrustworthy = useCallback(
    (p: VideoPlayer | null, currentTime: number) => {
      if (isResumePending(p)) {
        console.log(
          `[PlaybackPresenceTracking] Holding ${currentTime.toFixed(1)}s update — resume seek pending`,
        );
        return false;
      }
      return !isTransientRegression(currentTime, lastUpdateTimeRef.current);
    },
    [isTransientRegression],
  );

  // Mint a session id for the current identity if there is none (first
  // mount, a new episode, or playback resuming after endSession()).
  const ensureSession = useCallback((): string | null => {
    const id = latestRef.current.videoURL;
    if (!id) return null;
    if (!sessionIdRef.current || sessionVideoIdRef.current !== id) {
      sessionIdRef.current = Crypto.randomUUID();
      sessionVideoIdRef.current = id;
    }
    return sessionIdRef.current;
  }, []);

  const postUpdate = useCallback(
    async (
      body: PlaybackUpdateRequest,
      opts: { recordSentPosition?: number },
    ) => {
      const updatePromise = contentService.updatePlaybackProgress(body);
      pendingUpdateRef.current = updatePromise;
      await updatePromise;
      if (pendingUpdateRef.current === updatePromise) {
        pendingUpdateRef.current = null;
      }
      if (opts.recordSentPosition !== undefined) {
        lastSentAtRef.current = Date.now();
      }
    },
    [],
  );

  // Expose function to flush current progress immediately (for navigation
  // events and PiP transitions). `includeSessionId` defaults to true; pass
  // `false` when this flush is paired with an `endSession()` call for the
  // same session — the write then goes out as `kind: 'final'`. See the
  // resurrection footgun note on `PlaybackUpdateRequest`.
  const flushCurrentProgress = useCallback(
    async (opts?: { includeSessionId?: boolean }): Promise<void> => {
      const includeSessionId = opts?.includeSessionId ?? true;

      if (!player || !videoData || !videoURL || !isPlayerValid(player)) {
        return;
      }

      try {
        const currentTime = player.currentTime;
        if (typeof currentTime === "number" && currentTime > 0) {
          if (!isPositionTrustworthy(player, currentTime)) return;
          const mediaMetadata = buildMediaMetadata(videoData, params);
          if (!mediaMetadata) return;

          const kind: PlaybackUpdateKind = includeSessionId
            ? "progress"
            : "final";
          console.log(
            `[PlaybackPresenceTracking] Force flushing current progress (${kind})`,
          );

          const playbackData: PlaybackUpdateRequest = {
            videoId: videoURL,
            playbackTime: currentTime,
            kind,
            isPaused: !player.playing,
            ...(includeSessionId && sessionIdRef.current
              ? { sessionId: sessionIdRef.current }
              : {}),
            mediaMetadata,
          };

          lastUpdateTimeRef.current = currentTime;
          await postUpdate(playbackData, { recordSentPosition: currentTime });

          console.log(
            `[PlaybackPresenceTracking] Updated progress: ${currentTime}s`,
          );
        }
      } catch (error) {
        console.error(
          "[PlaybackPresenceTracking] Error in force flush:",
          error,
        );
      }
    },
    [
      player,
      videoData,
      videoURL,
      params,
      isPlayerValid,
      isPositionTrustworthy,
      postUpdate,
    ],
  );

  // A real position write (`kind: 'progress'`) with the session id.
  const sendPlaybackUpdate = useCallback(
    async (currentTime: number, isPaused: boolean) => {
      if (
        !isMountedRef.current ||
        isSuspended() ||
        !videoData ||
        !videoURL ||
        currentTime <= 0
      ) {
        return;
      }

      try {
        if (!isPositionTrustworthy(player, currentTime)) return;
        const mediaMetadata = buildMediaMetadata(videoData, params);
        if (!mediaMetadata) return;

        const sessionId = ensureSession();
        const playbackData: PlaybackUpdateRequest = {
          videoId: videoURL,
          playbackTime: currentTime,
          kind: "progress",
          isPaused,
          ...(sessionId ? { sessionId } : {}),
          mediaMetadata,
        };

        console.log(
          `[PlaybackPresenceTracking] Sending update for ${playbackData.mediaMetadata.mediaType} ${playbackData.mediaMetadata.mediaId} at ${currentTime}s (paused=${isPaused})`,
        );

        // Recorded before the request goes out so the cadence baseline and
        // the regression guard see it even if the request is slow.
        lastUpdateTimeRef.current = currentTime;
        lastPlayingSendAtRef.current = Date.now();
        await postUpdate(playbackData, { recordSentPosition: currentTime });

        if (isMountedRef.current) {
          console.log(
            `[PlaybackPresenceTracking] Updated progress: ${currentTime}s`,
          );
        }
      } catch (error) {
        if (isMountedRef.current) {
          console.error(
            "[PlaybackPresenceTracking] Failed to update progress:",
            error,
          );
        }
      }
    },
    [
      player,
      videoData,
      videoURL,
      params,
      isSuspended,
      isPositionTrustworthy,
      ensureSession,
      postUpdate,
    ],
  );

  // The paused "still here" ping: liveness only, no position.
  const sendKeepalive = useCallback(async () => {
    if (!isMountedRef.current || isSuspended() || !videoData || !videoURL) {
      return;
    }
    const sessionId = sessionIdRef.current;
    // No session means presence was ended (background while paused); there
    // is nothing to keep alive until playback resumes and mints a new one.
    if (!sessionId) return;

    try {
      const mediaMetadata = buildMediaMetadata(videoData, params);
      if (!mediaMetadata) return;

      console.log("[PlaybackPresenceTracking] Sending paused keepalive");
      await postUpdate(
        {
          videoId: videoURL,
          kind: "keepalive",
          isPaused: true,
          sessionId,
          mediaMetadata,
        },
        {},
      );
    } catch (error) {
      if (isMountedRef.current) {
        console.error(
          "[PlaybackPresenceTracking] Failed to send keepalive:",
          error,
        );
      }
    }
  }, [videoData, videoURL, params, isSuspended, postUpdate]);

  // Cleanup function to remove all listeners
  const cleanupListeners = useCallback(() => {
    listenersRef.current.forEach((listener) => {
      try {
        listener.remove();
      } catch (error) {
        console.error(
          "[PlaybackPresenceTracking] Error removing listener:",
          error,
        );
      }
    });
    listenersRef.current = [];
  }, []);

  // Cleanup function to clear both the playing-interval and the paused heartbeat
  const cleanupInterval = useCallback(() => {
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }
    stopPausedHeartbeat();
  }, [stopPausedHeartbeat]);

  // Ends the presence session for the current sessionId (idempotent on the
  // server). Clears the id first, so a pause event or paused tick that lands
  // while the request is in flight cannot re-upsert the row for the session
  // this just deleted; playback resuming later mints a fresh id.
  const endSession = useCallback(async (): Promise<void> => {
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    stopPausedHeartbeat();

    if (!sessionId) return;

    try {
      await contentService.endPlaybackPresence(sessionId);
    } catch (error) {
      console.error(
        "[PlaybackPresenceTracking] Failed to end presence session:",
        error,
      );
    }
  }, [stopPausedHeartbeat]);

  // Detach listeners and timers so nothing is written for the current
  // identity: on exit (before navigating away — the blur cleanup pauses the
  // player, and that pause must not turn into a write), and for the length
  // of an episode switch (the old listeners would otherwise report the new
  // episode's position under the old videoId for a turn). Lifted
  // automatically when the identity changes; call resumeTracking() if the
  // switch fails and the identity stays.
  const suspendTracking = useCallback(() => {
    suspendedForRef.current = latestRef.current.videoURL;
    cleanupListeners();
    cleanupInterval();
  }, [cleanupListeners, cleanupInterval]);

  const resumeTracking = useCallback(() => {
    if (!isSuspended()) return;
    suspendedForRef.current = undefined;
    cleanupListeners();
    cleanupInterval();
    setupTrackingRef.current?.();
  }, [isSuspended, cleanupListeners, cleanupInterval]);

  // The listener effect reads the senders through a ref: their identity
  // changes whenever videoData/params change, and re-running the effect for
  // that would tear the listeners down and re-attach them 100 ms later —
  // a gap wide enough to lose a pause event. Only an identity change
  // (`videoURL`) or the player itself should re-arm the listeners.
  const handlersRef = useRef({
    sendPlaybackUpdate,
    sendKeepalive,
    ensureSession,
  });
  handlersRef.current = { sendPlaybackUpdate, sendKeepalive, ensureSession };
  const hasVideoData = !!videoData;

  // Main effect for setting up tracking
  useEffect(() => {
    if (!player || !videoURL || !hasVideoData || !isPlayerValid(player)) return;

    isMountedRef.current = true;

    // A suspension is tied to the identity it was requested for; a new
    // identity (episode switch landed) lifts it.
    if (
      suspendedForRef.current !== undefined &&
      suspendedForRef.current !== videoURL
    ) {
      suspendedForRef.current = undefined;
    }

    if (trackedVideoIdRef.current !== videoURL) {
      trackedVideoIdRef.current = videoURL;
      lastUpdateTimeRef.current = 0;
      lastPlayingSendAtRef.current = 0;
      lastObservedTimeRef.current = null;
    }

    handlersRef.current.ensureSession();

    // Clear any existing listeners and intervals
    cleanupListeners();
    cleanupInterval();

    let initTimeoutId: ReturnType<typeof setTimeout>;

    const setupTracking = () => {
      if (
        !isMountedRef.current ||
        isSuspended() ||
        !player ||
        !isPlayerValid(player)
      ) {
        return;
      }

      try {
        const handleTimeUpdate = () => {
          if (!isMountedRef.current || !player || !isPlayerValid(player))
            return;

          try {
            const currentTime = player.currentTime;
            if (typeof currentTime !== "number") return;

            const previous = lastObservedTimeRef.current;
            lastObservedTimeRef.current = currentTime;
            const isSeek =
              previous !== null &&
              Math.abs(currentTime - previous) > SEEK_JUMP_S;
            const now = Date.now();
            const cadenceDue =
              now - lastPlayingSendAtRef.current >=
              PLAYING_HEARTBEAT_INTERVAL_MS;

            // Send every 30s of wall-clock while playing, or immediately on
            // a seek. sendPlaybackUpdate records the position and the send
            // time itself once it has passed the guards, so a held write
            // (resume seek pending) is retried on the next tick.
            if (isSeek || cadenceDue) {
              handlersRef.current.sendPlaybackUpdate(
                currentTime,
                !player.playing,
              );
            }
          } catch (error) {
            console.error(
              "[PlaybackPresenceTracking] Player released during time update:",
              error,
            );
            // Player has been released, clean up
            cleanupInterval();
            cleanupListeners();
          }
        };

        const handlePlayingChange = ({ isPlaying }: { isPlaying: boolean }) => {
          if (!isMountedRef.current || !player || !isPlayerValid(player))
            return;

          try {
            if (!isPlaying) {
              const currentTime = player.currentTime;
              if (typeof currentTime === "number" && currentTime > 0) {
                handlersRef.current.sendPlaybackUpdate(currentTime, true);
              }

              // Just paused — start the presence "still here" ping. The
              // server's paused-freshness window is 360s (2x this cadence).
              stopPausedHeartbeat();
              pausedHeartbeatIntervalRef.current = setInterval(() => {
                if (
                  !isMountedRef.current ||
                  !player ||
                  !isPlayerValid(player)
                ) {
                  stopPausedHeartbeat();
                  return;
                }
                handlersRef.current.sendKeepalive();
              }, PAUSED_HEARTBEAT_INTERVAL_MS);
            } else {
              // Resumed — stop the paused heartbeat. If presence was ended
              // meanwhile (background while paused), this mints a new
              // session for the next progress write.
              stopPausedHeartbeat();
              handlersRef.current.ensureSession();
            }
          } catch (error) {
            console.error(
              "[PlaybackPresenceTracking] Player released during playing change:",
              error,
            );
            // Player has been released, clean up
            cleanupInterval();
            cleanupListeners();
          }
        };

        // Set up periodic updates
        updateIntervalRef.current = setInterval(() => {
          if (!isMountedRef.current || !player || !isPlayerValid(player)) {
            cleanupInterval();
            return;
          }

          try {
            const isPlaying = player.playing;
            if (isPlaying) {
              handleTimeUpdate();
            }
          } catch (error) {
            console.error(
              "[PlaybackPresenceTracking] Player released during interval update:",
              error,
            );
            // Player has been released, clean up immediately
            cleanupInterval();
            cleanupListeners();
          }
        }, PLAYING_HEARTBEAT_INTERVAL_MS);

        // Set up event listeners
        try {
          const timeUpdateListener = player.addListener(
            "timeUpdate",
            handleTimeUpdate,
          );
          const playingChangeListener = player.addListener(
            "playingChange",
            handlePlayingChange,
          );
          const sourceChangeListener = player.addListener(
            "sourceChange",
            () => {
              sourceChangedAtRef.current = Date.now();
            },
          );

          // Store listeners for cleanup
          listenersRef.current.push(
            timeUpdateListener,
            playingChangeListener,
            sourceChangeListener,
          );
        } catch (error) {
          console.error(
            "[PlaybackPresenceTracking] Error setting up listeners:",
            error,
          );
        }
      } catch (error) {
        console.error(
          "[PlaybackPresenceTracking] Error in setupTracking:",
          error,
        );
      }
    };
    setupTrackingRef.current = setupTracking;

    // Small delay to ensure player is fully initialized
    initTimeoutId = setTimeout(setupTracking, 100);

    return () => {
      clearTimeout(initTimeoutId);
      cleanupListeners();
      cleanupInterval();
      // The session id is NOT cleared here: it belongs to the identity, not
      // to this effect run, so a re-run for the same title (a loader
      // refetch, a params change) keeps the same presence row instead of
      // abandoning it and minting another.
    };
  }, [
    player,
    videoURL,
    hasVideoData,
    isSuspended,
    cleanupListeners,
    cleanupInterval,
    isPlayerValid,
    stopPausedHeartbeat,
  ]);

  // Cleanup effect when component unmounts. An unclean unmount (iOS
  // swipe-back, a deep link, the screen being replaced) gets a final flush
  // and a presence end here; a clean exit has already done both and
  // suspended tracking, so this is a no-op for it.
  useEffect(() => {
    return () => {
      isMountedRef.current = false;

      cleanupListeners();
      cleanupInterval();

      if (suspendedForRef.current !== undefined) return;

      const {
        player: p,
        videoData: data,
        videoURL: id,
        params: latestParams,
      } = latestRef.current;
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;

      try {
        if (p && data && id && isPlayerValid(p)) {
          const currentTime = p.currentTime;
          const mediaMetadata = buildMediaMetadata(data, latestParams);
          if (
            typeof currentTime === "number" &&
            currentTime > 0 &&
            mediaMetadata &&
            !isResumePending(p) &&
            !isTransientRegression(currentTime, lastUpdateTimeRef.current)
          ) {
            console.log(
              `[PlaybackPresenceTracking] Unmount — final flush at ${currentTime.toFixed(1)}s`,
            );
            contentService
              .updatePlaybackProgress({
                videoId: id,
                playbackTime: currentTime,
                kind: "final",
                isPaused: true,
                mediaMetadata,
              })
              .catch((error) =>
                console.error(
                  "[PlaybackPresenceTracking] Unmount flush failed:",
                  error,
                ),
              );
          }
        }
      } catch (error) {
        console.error(
          "[PlaybackPresenceTracking] Error reading player on unmount:",
          error,
        );
      }

      if (sessionId) {
        contentService
          .endPlaybackPresence(sessionId)
          .catch((error) =>
            console.error(
              "[PlaybackPresenceTracking] Unmount presence end failed:",
              error,
            ),
          );
      }
    };
  }, [cleanupListeners, cleanupInterval, isPlayerValid, isTransientRegression]);

  // AppState backstop. Backgrounding always flushes the position (an app
  // kill from the switcher would otherwise lose up to 30s). While paused the
  // presence session is ended too — no legitimate "still consuming media
  // while paused in the background" case exists. While playing it stays
  // alive: PiP / background audio is a legitimate reason for a playing
  // session to keep going.
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") return;
      if (!player || !isPlayerValid(player)) return;
      if (isSuspended()) return;

      try {
        if (!player.playing) {
          flushCurrentProgress({ includeSessionId: false }).finally(() => {
            endSession();
          });
        } else {
          flushCurrentProgress();
        }
      } catch (error) {
        console.error(
          "[PlaybackPresenceTracking] Error checking player state on background:",
          error,
        );
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription?.remove();
    };
  }, [player, isPlayerValid, isSuspended, flushCurrentProgress, endSession]);

  return {
    flushCurrentProgress,
    endSession,
    suspendTracking,
    resumeTracking,
    getSessionId: () => sessionIdRef.current,
    /** Wall-clock ms of the last successful position write, 0 if none yet. */
    getLastSentAt: () => lastSentAtRef.current,
  };
}
