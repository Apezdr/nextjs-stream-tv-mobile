import type { VideoPlayer, StatusChangeEventPayload } from "expo-video";
import { useEffect, useRef, useState } from "react";

import { logPlaybackError } from "@/src/utils/videoDiagnostics";

interface Options {
  player: VideoPlayer;
  /** Current stream URL — included in diagnostic reports when provided. */
  videoURL?: string | null;
  /** Playback session UUID getter (usePlaybackPresenceTracking's), for
   * correlating error reports with sync/presence records server-side. */
  getPlaybackSessionId?: () => string | null;
  mediaId?: string | null;
  mediaType?: string | null;
  /**
   * When this returns true at error time, the user-facing error surface is
   * skipped (diagnostics still report) — the tier-descent fallback is
   * mid-recovery and a descent beats a dead-end error screen. The fallback
   * hook must be declared BEFORE this one so its listener claims the error
   * first.
   */
  suppressWhile?: () => boolean;
}

export function useVideoErrorHandling({
  player,
  videoURL,
  getPlaybackSessionId,
  mediaId,
  mediaType,
  suppressWhile,
}: Options): string | null {
  const errorRef = useRef<string | null>(null);
  const [error, setErrorState] = useState<string | null>(null);

  const setError = (msg: string | null) => {
    if (errorRef.current !== msg) {
      errorRef.current = msg;
      setErrorState(msg);
    }
  };

  // — Analyze video error and provide helpful message —
  const analyzeVideoError = (errorMessage: string): string => {
    if (errorMessage.includes("NO_EXCEEDS_CAPABILITIES")) {
      if (errorMessage.includes("10bit")) {
        return "Video format not supported: This device cannot decode 10-bit video content. Try a different quality or device.";
      }
      return "Video format not supported: This device cannot decode this video format. Try a different quality or device.";
    }

    // ExoPlayer: no decoder on this device advertises this mime/profile at
    // all (e.g. HEVC Main10 on decoders that only report Main).
    if (errorMessage.includes("NO_UNSUPPORTED_TYPE")) {
      return "Video format not supported: This device's decoder does not support this video codec or profile.";
    }

    if (errorMessage.includes("MediaCodecVideoRenderer")) {
      return "Video decoder error: The device's video decoder failed to process this content.";
    }

    if (errorMessage.includes("h264") || errorMessage.includes("avc")) {
      return "H.264 video codec error: Unable to decode this H.264 video stream.";
    }

    if (errorMessage.includes("hevc") || errorMessage.includes("h265")) {
      return "H.265 video codec error: This device may not support H.265/HEVC video.";
    }

    if (errorMessage.includes("vp9")) {
      return "VP9 video codec error: This device may not support VP9 video.";
    }

    if (errorMessage.includes("av1")) {
      return "AV1 video codec error: This device may not support AV1 video.";
    }

    return "Video playback error: Unable to play this video content on this device.";
  };

  // Keep the latest context readable from the status listener without
  // re-subscribing when it changes (effect deps stay [player]).
  const contextRef = useRef({
    videoURL,
    getPlaybackSessionId,
    mediaId,
    mediaType,
    suppressWhile,
  });
  contextRef.current = {
    videoURL,
    getPlaybackSessionId,
    mediaId,
    mediaType,
    suppressWhile,
  };

  // — One effect: subscribe once per player instance —
  useEffect(() => {
    const onStatusChange = ({ status, error: e }: StatusChangeEventPayload) => {
      console.log("[useVideoErrorHandling] Status change:", {
        status,
        error: e,
      });

      // Any player error: emit a full diagnostic report (raw ExoPlayer
      // message + device model + decoder capability probe), logged locally
      // and sent to the connected server's client-error endpoint.
      if (e) {
        const ctx = contextRef.current;
        logPlaybackError({
          rawErrorMessage: e.message,
          videoURL: ctx.videoURL ?? null,
          playerStatus: status,
          playbackSessionId: ctx.getPlaybackSessionId?.() ?? null,
          mediaId: ctx.mediaId ?? null,
          mediaType: ctx.mediaType ?? null,
        });
      }

      // Only handle video-related codec/decoder errors
      if (
        e?.message.match(
          /MediaCodecVideoRenderer|video.*codec|video.*decoder|DecoderInitializationException|NO_EXCEEDS_CAPABILITIES|NO_UNSUPPORTED_TYPE|h264|h265|hevc|vp9|av1|avc/i,
        )
      ) {
        if (contextRef.current.suppressWhile?.()) {
          // The tier-descent fallback claimed this error and is swapping the
          // source — a recovery in progress must not flash a fatal screen.
          console.log(
            "[useVideoErrorHandling] Error surface suppressed during tier descent:",
            e.message,
          );
          return;
        }
        console.log(
          "[useVideoErrorHandling] Video codec error detected:",
          e.message,
        );
        const userFriendlyError = analyzeVideoError(e.message);
        setError(userFriendlyError);
      } else if (e) {
        console.log(
          "[useVideoErrorHandling] Non-video error (not handling):",
          e.message,
        );
      } else if (status === "readyToPlay") {
        console.log(
          "[useVideoErrorHandling] Video ready, clearing error state",
        );
        setError(null);
      }
    };

    const subs = [player.addListener("statusChange", onStatusChange)];

    return () => {
      subs.forEach((s) => s.remove());
    };
  }, [player]);

  return error;
}
