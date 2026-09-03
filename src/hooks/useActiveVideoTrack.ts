import type { VideoPlayer, VideoTrack } from "expo-video";
import { useEffect, useState } from "react";

/**
 * The video track the player is rendering right now — the ABR rung on HLS,
 * the file's single track on a direct play. Null until the player reports
 * one. Follows `videoTrackChange` and re-reads on source load and ready, the
 * same backstops the audio-track hook needs on platforms that populate the
 * track late.
 */
export function useActiveVideoTrack(
  player: VideoPlayer | null,
): VideoTrack | null {
  const [track, setTrack] = useState<VideoTrack | null>(() => {
    try {
      return player?.videoTrack ?? null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!player) {
      setTrack(null);
      return;
    }
    const read = () => {
      try {
        setTrack(player.videoTrack ?? null);
      } catch {
        // Keep the last known track if the native read throws.
      }
    };
    read();
    const subs = [
      player.addListener("videoTrackChange", ({ videoTrack }) => {
        setTrack(videoTrack ?? null);
      }),
      player.addListener("sourceLoad", read),
      player.addListener("statusChange", ({ status }) => {
        if (status === "readyToPlay") read();
      }),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, [player]);

  return track;
}
