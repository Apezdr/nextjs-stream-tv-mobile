import type { VideoPlayer } from "expo-video";

// How far below the target the player may land before the guard re-seeks.
// Wide enough to ignore keyframe snapping and seek tolerance, narrow enough
// that "restarted from the beginning" always trips it.
const TOLERANCE_S = 15;
// The guard disarms itself if the source never becomes playable.
const GUARD_TTL_MS = 30_000;

// Players with a resume seek still in flight. While a guard is armed the
// player's reported position is not trustworthy (the new source starts at 0
// until the seek lands), so the presence tracker holds its heartbeats — a
// position written in that window would overwrite the saved one.
const pendingGuards = new WeakMap<object, number>();

function trackPending(player: VideoPlayer, delta: 1 | -1): void {
  const next = (pendingGuards.get(player) ?? 0) + delta;
  if (next <= 0) pendingGuards.delete(player);
  else pendingGuards.set(player, next);
}

/** Whether a resume seek is still pending on this player. */
export function isResumePending(player: VideoPlayer | null): boolean {
  return !!player && (pendingGuards.get(player) ?? 0) > 0;
}

/**
 * Seek to `targetSeconds` and make sure the seek survives the source commit.
 *
 * expo-video attaches a player's source asynchronously: `player.currentTime`
 * assigned before the commit lands is discarded when the media item is set
 * (ExoPlayer resets the position on a new item), and playback starts from
 * zero. The window is timing-dependent — ~100 ms on a warm HLS master, over
 * a second on a raw 4K file — which is why resume "sometimes" fails. Same
 * race for every source swap that re-seeks after `replaceAsync`.
 *
 * The guard seeks immediately (the fast path when the commit already
 * happened), seeks again the moment the source reports as changed, and on the
 * first `readyToPlay` verifies the landing, re-seeking if the player is more
 * than TOLERANCE_S short of the target. Returns a disposer; the guard also
 * disposes itself after the first ready or after GUARD_TTL_MS.
 */
export function applyResumePosition(
  player: VideoPlayer,
  targetSeconds: number,
  label = "resumeGuard",
): () => void {
  if (!(targetSeconds > 0)) return () => {};

  const seek = () => {
    try {
      player.currentTime = targetSeconds;
    } catch (error) {
      console.warn(`[${label}] Seek to ${targetSeconds}s failed:`, error);
    }
  };

  seek();

  let disposed = false;
  let sourceSub: { remove: () => void } | null = null;
  let statusSub: { remove: () => void } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  trackPending(player, 1);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    trackPending(player, -1);
    sourceSub?.remove();
    statusSub?.remove();
    if (timer) clearTimeout(timer);
  };

  try {
    sourceSub = player.addListener("sourceChange", () => {
      // The item is set now, so this seek can no longer be reset away.
      seek();
    });
    statusSub = player.addListener("statusChange", ({ status, error }) => {
      if (status !== "readyToPlay" || error) return;
      let landed = 0;
      try {
        landed = player.currentTime || 0;
      } catch {
        landed = 0;
      }
      if (landed < targetSeconds - TOLERANCE_S) {
        console.warn(
          `[${label}] Landed at ${landed.toFixed(1)}s, expected ${targetSeconds.toFixed(1)}s — re-seeking`,
        );
        seek();
      }
      dispose();
    });
  } catch (error) {
    console.warn(`[${label}] Could not arm resume guard:`, error);
    dispose();
    return dispose;
  }
  timer = setTimeout(dispose, GUARD_TTL_MS);
  return dispose;
}
