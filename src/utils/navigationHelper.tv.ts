import { router } from "expo-router";

// Define type-safe route builders for TV navigation
type WatchRoute = "/(tv)/(protected)/watch/[id]";
type MediaInfoRoute = "/(tv)/(protected)/media-info/[id]";
type BrowseRoute = `/(tv)/(protected)/(browse)/${string}`;

interface NavigationParams {
  id: string;
  type: string;
  season?: number;
  episode?: number;
  backdrop?: string;
  backdropBlurhash?: string;
  [key: string]: any;
}

// Simple navigation logging
const logNavigation = (
  action: string,
  route: string,
  params: any,
  method: "push" | "replace" | "navigate",
) => {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
  console.log(
    `🔄 [${timestamp}] TV_NAV_${action} (${method.toUpperCase()}): ${route}`,
  );
  console.log(`   Params:`, JSON.stringify(params, null, 2));
};

export const navigationHelper = {
  /**
   * Navigate to watch screen (TV)
   * Uses dangerouslySingular to prevent duplicate watch screens.
   */
  navigateToWatch: (params: NavigationParams) => {
    const route: WatchRoute = "/(tv)/(protected)/watch/[id]";
    logNavigation("WATCH", route, params, "push");

    router.push(
      {
        pathname: route,
        params,
      },
      {
        dangerouslySingular: true,
      },
    );
  },

  /**
   * Navigate to media info screen (TV)
   * All TV media info navigation uses push with dangerouslySingular.
   */
  navigateToMediaInfo: (
    params: NavigationParams,
    _fromEpisodeInfo = false,
    _fromWatch = false,
  ) => {
    const route: MediaInfoRoute = "/(tv)/(protected)/media-info/[id]";
    logNavigation("MEDIA_INFO", route, params, "push");

    router.push(
      {
        pathname: route,
        params,
      },
      {
        dangerouslySingular: true,
      },
    );
  },

  /**
   * Navigate to episode info (TV)
   * TV has no dedicated episode-info screen. Episodes with full season/episode
   * go directly to the watch screen; otherwise fall back to media-info.
   */
  navigateToEpisodeInfo: (params: {
    showId: string;
    season: number;
    episode: number;
    [key: string]: any;
  }) => {
    // On TV, navigate directly to media-info for the show.
    // The media-info page handles season/episode display.
    const route: MediaInfoRoute = "/(tv)/(protected)/media-info/[id]";
    logNavigation("EPISODE_INFO→MEDIA_INFO", route, params, "push");

    router.push(
      {
        pathname: route,
        params: {
          id: params.showId,
          type: "tv",
          season: params.season,
          episode: params.episode,
        },
      },
      {
        dangerouslySingular: true,
      },
    );
  },

  /**
   * Navigate to browse tab screens (TV)
   * TV uses top nav rather than tabs, so navigate to browse routes directly.
   */
  navigateToTab: (tabName: string, params: Record<string, string> = {}) => {
    const route = `/(tv)/(protected)/(browse)/${tabName}` as BrowseRoute;
    logNavigation("TAB→BROWSE", route, { tabName, ...params }, "push");

    router.push({
      pathname: route,
      params,
    } as any);
  },
};
