import type { WatchHistory } from "@/src/data/types/content.types";
import {
  WATCH_START_THRESHOLD_S,
  hasReachedWatchStart,
  isInWatchHistory,
} from "@/src/utils/watchStart";

const row = (overrides: Partial<WatchHistory> = {}): WatchHistory => ({
  playbackTime: 0,
  lastWatched: "2026-10-27T00:00:00Z",
  isWatched: true,
  normalizedVideoId: null,
  ...overrides,
});

describe("isInWatchHistory", () => {
  it("is false without a row", () => {
    expect(isInWatchHistory(undefined)).toBe(false);
    expect(isInWatchHistory(null)).toBe(false);
  });

  it("is true for any stored row, even at position 0", () => {
    expect(isInWatchHistory(row())).toBe(true);
  });

  it("falls back to the position on servers that predate isWatched", () => {
    expect(isInWatchHistory(row({ isWatched: false, playbackTime: 0 }))).toBe(
      false,
    );
    expect(isInWatchHistory(row({ isWatched: false, playbackTime: 3 }))).toBe(
      true,
    );
  });
});

describe("hasReachedWatchStart", () => {
  it("holds a never-started title under the threshold", () => {
    expect(hasReachedWatchStart(0, undefined)).toBe(false);
    expect(hasReachedWatchStart(WATCH_START_THRESHOLD_S - 0.5, undefined)).toBe(
      false,
    );
  });

  it("passes once the threshold is reached", () => {
    expect(hasReachedWatchStart(WATCH_START_THRESHOLD_S, undefined)).toBe(true);
    expect(hasReachedWatchStart(600, null)).toBe(true);
  });

  it("keeps updating a title already in history at any position", () => {
    expect(hasReachedWatchStart(1, row())).toBe(true);
    expect(hasReachedWatchStart(1, row({ playbackTime: 1200 }))).toBe(true);
  });

  it("honours a custom threshold", () => {
    expect(hasReachedWatchStart(20, undefined, 30)).toBe(false);
    expect(hasReachedWatchStart(30, undefined, 30)).toBe(true);
  });
});
