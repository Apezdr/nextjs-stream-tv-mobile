import { contentService } from "@/src/data/services/contentService";
import type { MediaItem } from "@/src/data/types/content.types";

export interface EpisodeTarget {
  season: number;
  episode: number;
}

/**
 * The episode a show should open on, from a Continue Watching list whose
 * rows hoist the viewer's most recent episode onto the show item. Null when
 * the show is not in the list (never watched) or the row carries no numbers.
 */
export function findInProgressEpisode(
  items: readonly MediaItem[] | undefined,
  showId: string,
): EpisodeTarget | null {
  if (!items) return null;
  for (const item of items) {
    if (item.id !== showId || item.type !== "tv") continue;
    if (
      typeof item.seasonNumber === "number" &&
      typeof item.episodeNumber === "number" &&
      item.episodeNumber > 0
    ) {
      return { season: item.seasonNumber, episode: item.episodeNumber };
    }
    return null;
  }
  return null;
}

/**
 * Resolve where "Watch" should land for a show when the caller only has the
 * show id (the screensaver payload carries no episode). Consults the
 * server's Continue Watching order — the same rows the home screen shows —
 * so the choice matches what the viewer would have picked there. Null means
 * "no episode in progress": route to media-info and let the viewer choose,
 * rather than guessing S01E01 and writing a new row for it.
 */
export async function resolveShowWatchTarget(
  showId: string,
): Promise<EpisodeTarget | null> {
  try {
    const list = await contentService.getContentList({
      type: "recentlyWatched",
      sort: "date",
      sortOrder: "desc",
      limit: 50,
    });
    return findInProgressEpisode(list.currentItems, showId);
  } catch (error) {
    console.warn(
      "[nextUpEpisode] Could not resolve in-progress episode:",
      error,
    );
    return null;
  }
}
