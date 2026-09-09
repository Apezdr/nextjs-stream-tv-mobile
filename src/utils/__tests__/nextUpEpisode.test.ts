import type { MediaItem } from "@/src/data/types/content.types";
import { findInProgressEpisode } from "@/src/utils/nextUpEpisode";

const item = (overrides: Partial<MediaItem>): MediaItem => ({
  id: "show-1",
  title: "Show",
  type: "tv",
  lastWatchedDate: "2026-09-01",
  link: "/tv/show-1",
  ...overrides,
});

describe("findInProgressEpisode", () => {
  it("returns the hoisted episode for the matching show", () => {
    const items = [
      item({ id: "other", seasonNumber: 1, episodeNumber: 1 }),
      item({ id: "show-1", seasonNumber: 3, episodeNumber: 5 }),
    ];
    expect(findInProgressEpisode(items, "show-1")).toEqual({
      season: 3,
      episode: 5,
    });
  });

  it("keeps season 0 (specials)", () => {
    expect(
      findInProgressEpisode(
        [item({ seasonNumber: 0, episodeNumber: 2 })],
        "show-1",
      ),
    ).toEqual({ season: 0, episode: 2 });
  });

  it("is null when the show is absent or the row has no numbers", () => {
    expect(findInProgressEpisode([], "show-1")).toBeNull();
    expect(findInProgressEpisode(undefined, "show-1")).toBeNull();
    expect(findInProgressEpisode([item({})], "show-1")).toBeNull();
    expect(
      findInProgressEpisode(
        [item({ type: "movie", seasonNumber: 1 })],
        "show-1",
      ),
    ).toBeNull();
  });
});
