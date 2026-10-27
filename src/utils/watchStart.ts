import type { WatchHistory } from "@/src/data/types/content.types";

/**
 * Media time a title the viewer has never started must reach before this
 * client writes a position for it. The watch screens auto-play as soon as
 * the player is ready, before the first frame is on screen, so an accidental
 * open that is backed out of while the picture is still loading is already a
 * few seconds in — and the exit flush used to put it in Continue Watching on
 * every device. The server's own floor is 2 s. Chosen 2026-10-27 (8 s); the
 * agreed follow-up is a way to remove a row from watch history.
 */
export const WATCH_START_THRESHOLD_S = 8;

/**
 * Whether the server already holds a row for this title. `isWatched` is set
 * for ANY stored row (see `WatchHistory`); `playbackTime` covers servers
 * that predate it.
 */
export function isInWatchHistory(
  watchHistory: WatchHistory | null | undefined,
): boolean {
  return (
    !!watchHistory && (watchHistory.isWatched || watchHistory.playbackTime > 0)
  );
}

/**
 * Whether a position write for this title may go out: the title is already
 * in watch history (which keeps updating at any position), or playback has
 * reached the start threshold.
 */
export function hasReachedWatchStart(
  positionSeconds: number,
  watchHistory: WatchHistory | null | undefined,
  thresholdSeconds: number = WATCH_START_THRESHOLD_S,
): boolean {
  if (isInWatchHistory(watchHistory)) return true;
  return positionSeconds >= thresholdSeconds;
}
