import type { VideoPlayer, StatusChangeEventPayload } from "expo-video";
import { useEffect, useRef, useState } from "react";

interface Options {
  player: VideoPlayer;
}

export function useVideoErrorHandling({ player }: Options): string | null {
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

  // — One effect: subscribe once per player instance —
  useEffect(() => {
    const onStatusChange = ({ status, error: e }: StatusChangeEventPayload) => {
      console.log("[useVideoErrorHandling] Status change:", {
        status,
        error: e,
      });

      // Only handle video-related codec/decoder errors
      if (
        e?.message.match(
          /MediaCodecVideoRenderer|video.*codec|video.*decoder|h264|h265|hevc|vp9|av1|avc/i,
        )
      ) {
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
