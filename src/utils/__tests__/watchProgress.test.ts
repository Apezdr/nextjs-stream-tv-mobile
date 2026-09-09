import type { WatchHistory } from "@/src/data/types/content.types";
import {
  COMPLETION_THRESHOLD_PERCENT,
  hasResumableProgress,
  isWatchCompleted,
  patchWatchHistoryPosition,
  watchProgressPercent,
} from "@/src/utils/watchProgress";

const row = (overrides: Partial<WatchHistory> = {}): WatchHistory => ({
  playbackTime: 600,
  lastWatched: "2026-09-08T00:00:00.000Z",
  isWatched: true,
  normalizedVideoId: "abc",
  ...overrides,
});

describe("watchProgressPercent", () => {
  it("derives the percentage from seconds over a millisecond duration", () => {
    expect(watchProgressPercent(row(), 1_200_000)).toBe(50);
  });

  it("prefers the server's progressPercent when present", () => {
    expect(watchProgressPercent(row({ progressPercent: 92 }), 1_200_000)).toBe(
      92,
    );
    // ...even without a duration to compute from
    expect(watchProgressPercent(row({ progressPercent: 12 }))).toBe(12);
  });

  it("clamps to 0–100", () => {
    expect(watchProgressPercent(row({ playbackTime: 5000 }), 1_200_000)).toBe(
      100,
    );
    expect(watchProgressPercent(row({ progressPercent: 140 }))).toBe(100);
    expect(watchProgressPercent(row({ progressPercent: -3 }))).toBe(0);
  });

  it("is null without history, position or duration", () => {
    expect(watchProgressPercent(undefined, 1000)).toBeNull();
    expect(watchProgressPercent(row({ playbackTime: 0 }), 1000)).toBeNull();
    expect(watchProgressPercent(row(), undefined)).toBeNull();
    expect(watchProgressPercent(row(), 0)).toBeNull();
  });
});

describe("isWatchCompleted", () => {
  it("uses the server verdict when present, whatever the numbers say", () => {
    expect(
      isWatchCompleted(row({ completed: true, playbackTime: 5 }), 1e6),
    ).toBe(true);
    expect(
      isWatchCompleted(row({ completed: false, playbackTime: 5000 }), 1e6),
    ).toBe(false);
  });

  it("falls back to the local threshold", () => {
    const durationMs = 1_000_000;
    const at = (percent: number) =>
      row({ playbackTime: (durationMs / 1000) * (percent / 100) });
    expect(isWatchCompleted(at(COMPLETION_THRESHOLD_PERCENT), durationMs)).toBe(
      true,
    );
    expect(
      isWatchCompleted(at(COMPLETION_THRESHOLD_PERCENT - 1), durationMs),
    ).toBe(false);
  });

  it("never treats isWatched alone as finished", () => {
    expect(
      isWatchCompleted(row({ isWatched: true, playbackTime: 1 }), 1e6),
    ).toBe(false);
    expect(isWatchCompleted(row(), undefined)).toBe(false);
  });
});

describe("hasResumableProgress", () => {
  it("requires a position above the floor", () => {
    expect(hasResumableProgress(row({ playbackTime: 9 }), 10)).toBe(false);
    expect(hasResumableProgress(row({ playbackTime: 11 }), 10)).toBe(true);
    expect(hasResumableProgress(undefined)).toBe(false);
  });
});

describe("patchWatchHistoryPosition", () => {
  it("moves the position and drops the server's derived fields", () => {
    const patched = patchWatchHistoryPosition(
      row({ completed: true, progressPercent: 99 }),
      120,
    );
    expect(patched.playbackTime).toBe(120);
    expect(patched.completed).toBeUndefined();
    expect(patched.progressPercent).toBeUndefined();
    expect(patched.normalizedVideoId).toBe("abc");
    expect(Date.parse(patched.lastWatched)).not.toBeNaN();
  });

  it("builds a row from nothing", () => {
    const patched = patchWatchHistoryPosition(undefined, 30);
    expect(patched.playbackTime).toBe(30);
    expect(patched.normalizedVideoId).toBeNull();
    expect(patched.isWatched).toBe(true);
  });
});
