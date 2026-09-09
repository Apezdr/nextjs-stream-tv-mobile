import type { WatchHistory } from "@/src/data/types/content.types";

/**
 * One definition of "how far through" and "finished" for every surface that
 * draws a bar, a check badge or a Watched label — Continue Watching cards,
 * media-info, the episode carousel, the mobile episode list.
 *
 * The server computes `completed` and `progressPercent` at join time from the
 * catalog duration; those win whenever present so this app, the web app and
 * a Cast receiver all agree on a title's state. The local rule below only
 * covers servers that predate the fields.
 */

/** Local fallback threshold. The web app uses 90; the shared contract lists
 *  the number as an open decision, so keep it in one place. */
export const COMPLETION_THRESHOLD_PERCENT = 95;

/** Catalog durations are milliseconds; playback positions are seconds. */
export function durationMsToSeconds(durationMs: number | null | undefined) {
  return durationMs && durationMs > 0 ? durationMs / 1000 : 0;
}

/**
 * Progress through the title as a 0–100 percentage, or null when nothing can
 * be computed (no history, no position, no duration and no server figure).
 */
export function watchProgressPercent(
  watchHistory: WatchHistory | null | undefined,
  durationMs?: number | null,
): number | null {
  if (!watchHistory) return null;

  if (
    typeof watchHistory.progressPercent === "number" &&
    Number.isFinite(watchHistory.progressPercent)
  ) {
    return Math.min(100, Math.max(0, watchHistory.progressPercent));
  }

  const playbackTime = watchHistory.playbackTime;
  if (!(playbackTime > 0)) return null;
  const durationSeconds = durationMsToSeconds(durationMs);
  if (durationSeconds <= 0) return null;

  return Math.min(100, (playbackTime / durationSeconds) * 100);
}

/** Whether the title counts as finished. Server verdict first, local rule second. */
export function isWatchCompleted(
  watchHistory: WatchHistory | null | undefined,
  durationMs?: number | null,
): boolean {
  if (!watchHistory) return false;
  if (typeof watchHistory.completed === "boolean") {
    return watchHistory.completed;
  }
  const percent = watchProgressPercent(watchHistory, durationMs);
  return percent !== null && percent >= COMPLETION_THRESHOLD_PERCENT;
}

/** True when there is a resumable position worth surfacing (a bar, a label). */
export function hasResumableProgress(
  watchHistory: WatchHistory | null | undefined,
  minSeconds = 0,
): boolean {
  return !!watchHistory && watchHistory.playbackTime > minSeconds;
}

/**
 * A locally-updated copy of a row after this device wrote `playbackTime`,
 * for surfaces that keep a cached list (the episode carousel). The server's
 * derived fields are dropped so the local rule recomputes from the new
 * position instead of showing a stale percentage.
 */
export function patchWatchHistoryPosition(
  existing: WatchHistory | undefined,
  playbackTime: number,
): WatchHistory {
  return {
    ...existing,
    playbackTime,
    lastWatched: new Date().toISOString(),
    isWatched: true,
    normalizedVideoId: existing?.normalizedVideoId ?? null,
    completed: undefined,
    progressPercent: undefined,
  };
}
