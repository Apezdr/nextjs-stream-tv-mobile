import * as Crypto from "expo-crypto";
import { VideoPlayer } from "expo-video";
import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

import {
  contentService,
  PlaybackUpdateRequest,
} from "@/src/data/services/contentService";
import { MediaDetailsResponse } from "@/src/data/types/content.types";

const PLAYING_HEARTBEAT_INTERVAL_MS = 30_000;
const PAUSED_HEARTBEAT_INTERVAL_MS = 180_000;

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

/**
 * Shared playback + presence heartbeat tracking, used by both the TV and
 * mobile watch screens. Sends `updatePlayback` on a 30s interval while
 * playing, immediately on pause/seek, and on a 180s interval while paused
 * (the presence "still here" ping) — plus ends the presence session via
 * `presence/end` on explicit exit or on backgrounding while paused.
 */
export function usePlaybackPresenceTracking(
  player: VideoPlayer,
  videoData: MediaDetailsResponse | null,
  videoURL: string | null,
  params: WatchParams,
) {
  const lastUpdateTimeRef = useRef<number>(0);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pausedHeartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const listenersRef = useRef<{ remove: () => void }[]>([]);
  const isMountedRef = useRef(true);
  const pendingUpdateRef = useRef<Promise<void> | null>(null);
  const sessionIdRef = useRef<string | null>(null);

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

  const buildMediaMetadata = useCallback(():
    | PlaybackUpdateRequest["mediaMetadata"]
    | null => {
    if (!videoData) return null;

    return {
      mediaType: videoData.type || params.type,
      mediaId: videoData.id || params.id,
      ...(params.type === "tv" && {
        showId: params.id,
        seasonNumber:
          videoData.seasonNumber || parseNumericParam(params.season),
        episodeNumber:
          videoData.episodeNumber || parseNumericParam(params.episode),
      }),
    };
  }, [videoData, params.type, params.id, params.season, params.episode]);

  const stopPausedHeartbeat = useCallback(() => {
    if (pausedHeartbeatIntervalRef.current) {
      clearInterval(pausedHeartbeatIntervalRef.current);
      pausedHeartbeatIntervalRef.current = null;
    }
  }, []);

  // Expose function to flush current progress immediately (for navigation
  // events and PiP transitions). `includeSessionId` defaults to true; pass
  // `false` when this flush is paired with an `endSession()` call for the
  // same session — see the resurrection footgun note on `PlaybackUpdateRequest`.
  const flushCurrentProgress = useCallback(
    async (opts?: { includeSessionId?: boolean }): Promise<void> => {
      const includeSessionId = opts?.includeSessionId ?? true;

      if (!player || !videoData || !videoURL || !isPlayerValid(player)) {
        return;
      }

      try {
        const currentTime = player.currentTime;
        if (typeof currentTime === "number" && currentTime > 0) {
          const mediaMetadata = buildMediaMetadata();
          if (!mediaMetadata) return;

          console.log(
            "[PlaybackPresenceTracking] Force flushing current progress",
          );

          const playbackData: PlaybackUpdateRequest = {
            videoId: videoURL,
            playbackTime: currentTime,
            isPaused: !player.playing,
            ...(includeSessionId && sessionIdRef.current
              ? { sessionId: sessionIdRef.current }
              : {}),
            mediaMetadata,
          };

          await contentService.updatePlaybackProgress(playbackData);
          lastUpdateTimeRef.current = currentTime;

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
    [player, videoData, videoURL, isPlayerValid, buildMediaMetadata],
  );

  const sendPlaybackUpdate = useCallback(
    async (currentTime: number, isPaused: boolean) => {
      if (
        !isMountedRef.current ||
        !videoData ||
        !videoURL ||
        currentTime <= 0
      ) {
        return;
      }

      try {
        const mediaMetadata = buildMediaMetadata();
        if (!mediaMetadata) return;

        const playbackData: PlaybackUpdateRequest = {
          videoId: videoURL,
          playbackTime: currentTime,
          isPaused,
          ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
          mediaMetadata,
        };

        console.log(
          `[PlaybackPresenceTracking] Sending update for ${playbackData.mediaMetadata.mediaType} ${playbackData.mediaMetadata.mediaId} at ${currentTime}s (paused=${isPaused})`,
        );

        // Store the promise to handle cleanup
        const updatePromise =
          contentService.updatePlaybackProgress(playbackData);
        pendingUpdateRef.current = updatePromise;

        await updatePromise;

        // Clear the pending update if it's still the same one
        if (pendingUpdateRef.current === updatePromise) {
          pendingUpdateRef.current = null;
        }

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
    [videoData, videoURL, buildMediaMetadata],
  );

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
  // server). Also stops the paused heartbeat — otherwise the next tick would
  // resurrect the very session this just deleted.
  const endSession = useCallback(async (): Promise<void> => {
    const sessionId = sessionIdRef.current;
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

  // Main effect for setting up tracking
  useEffect(() => {
    if (!player || !videoURL || !videoData || !isPlayerValid(player)) return;

    isMountedRef.current = true;

    if (!sessionIdRef.current) {
      sessionIdRef.current = Crypto.randomUUID();
    }

    // Clear any existing listeners and intervals
    cleanupListeners();
    cleanupInterval();

    let initTimeoutId: NodeJS.Timeout;

    const setupTracking = () => {
      if (!isMountedRef.current || !player || !isPlayerValid(player)) return;

      try {
        const handleTimeUpdate = () => {
          if (!isMountedRef.current || !player || !isPlayerValid(player))
            return;

          try {
            const currentTime = player.currentTime;
            if (typeof currentTime !== "number") return;

            const timeSinceLastUpdate = currentTime - lastUpdateTimeRef.current;

            // Update if 30 seconds have passed or if there's a significant jump (seeking)
            if (
              timeSinceLastUpdate >= 30 ||
              Math.abs(timeSinceLastUpdate) > 10
            ) {
              lastUpdateTimeRef.current = currentTime;
              sendPlaybackUpdate(currentTime, !player.playing);
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
                lastUpdateTimeRef.current = currentTime;
                sendPlaybackUpdate(currentTime, true);
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

                try {
                  const time = player.currentTime;
                  if (typeof time === "number" && time > 0) {
                    sendPlaybackUpdate(time, true);
                  }
                } catch (error) {
                  console.error(
                    "[PlaybackPresenceTracking] Player released during paused heartbeat:",
                    error,
                  );
                  stopPausedHeartbeat();
                }
              }, PAUSED_HEARTBEAT_INTERVAL_MS);
            } else {
              // Resumed — stop the paused heartbeat.
              stopPausedHeartbeat();
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

          // Store listeners for cleanup
          listenersRef.current.push(timeUpdateListener, playingChangeListener);
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

    // Small delay to ensure player is fully initialized
    initTimeoutId = setTimeout(setupTracking, 100);

    return () => {
      clearTimeout(initTimeoutId);
      cleanupListeners();
      cleanupInterval();
      sessionIdRef.current = null;
    };
  }, [
    player,
    videoURL,
    videoData,
    sendPlaybackUpdate,
    cleanupListeners,
    cleanupInterval,
    isPlayerValid,
    stopPausedHeartbeat,
  ]);

  // Cleanup effect when component unmounts
  useEffect(() => {
    return () => {
      isMountedRef.current = false;

      // Clean up everything
      cleanupListeners();
      cleanupInterval();

      // Note: We don't flush progress here — that's handled by navigation
      // event handlers before unmount occurs.
    };
  }, [cleanupListeners, cleanupInterval]);

  // AppState backstop: end presence immediately if the app backgrounds while
  // paused. Deliberately does NOT fire while playing — PiP / background
  // audio is a legitimate reason for a playing session to stay alive while
  // backgrounded, unlike a paused one (no legitimate "still consuming media
  // while paused in the background" case exists).
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") return;
      if (!player || !isPlayerValid(player)) return;

      try {
        if (!player.playing) {
          endSession();
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
  }, [player, isPlayerValid, endSession]);

  return {
    flushCurrentProgress,
    endSession,
    getSessionId: () => sessionIdRef.current,
  };
}
