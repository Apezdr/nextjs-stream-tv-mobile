import { router, type Href } from "expo-router";

// Define type-safe route builders
type WatchRoute = "/(mobile)/(protected)/watch/[id]";
type MediaInfoRoute = "/(mobile)/(protected)/media-info/[id]";
type EpisodeInfoRoute =
  "/(mobile)/(protected)/episode-info/[showId]/[season]/[episode]";
type TabRoute = `/(mobile)/(protected)/(tabs)/${string}`;

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
  method: "push" | "replace",
) => {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
  console.log(
    `🔄 [${timestamp}] NAV_${action} (${method.toUpperCase()}): ${route}`,
  );
  console.log(`   Params:`, JSON.stringify(params, null, 2));
};

export const navigationHelper = {
  /**
   * Navigate to watch screen - always replace to prevent video screen accumulation
   */
  navigateToWatch: (params: NavigationParams) => {
    const route = "/(mobile)/(protected)/watch/[id]";
    logNavigation("WATCH", route, params, "replace");

    router.navigate({
      pathname: route as WatchRoute,
      params,
    });
  },

  /**
   * Navigate to media info screen with smart navigation based on source
   */
  navigateToMediaInfo: (
    params: NavigationParams,
    fromEpisodeInfo = false,
    fromWatch = false,
  ) => {
    const route = "/(mobile)/(protected)/media-info/[id]";

    if (fromEpisodeInfo) {
      // Use dismissTo to clean up duplicate Media Info screens
      logNavigation("MEDIA_INFO", route, params, "push");

      router.navigate({
        pathname: route as MediaInfoRoute,
        params,
      });
    } else if (fromWatch) {
      // Use replace for Watch → Media Info to prevent Watch screen accumulation
      logNavigation("MEDIA_INFO", route, params, "replace");

      router.navigate({ pathname: route as MediaInfoRoute, params });
    } else {
      // Normal push navigation from other screens
      logNavigation("MEDIA_INFO", route, params, "push");
      router.push({ pathname: route as MediaInfoRoute, params });
    }
  },

  /**
   * Navigate to episode info - simple push navigation
   */
  navigateToEpisodeInfo: (params: {
    showId: string;
    season: number;
    episode: number;
    [key: string]: any;
  }) => {
    const route =
      "/(mobile)/(protected)/episode-info/[showId]/[season]/[episode]";
    logNavigation("EPISODE_INFO", route, params, "push");

    router.push({ pathname: route as any, params });
  },

  /**
   * Navigate to tab screens
   */
  navigateToTab: (tabName: string, params: any = {}) => {
    const route = `/(mobile)/(protected)/(tabs)/${tabName}`;
    logNavigation("TAB", route, { tabName, ...params }, "push");

    router.push({
      pathname: route,
      params,
    } as Href);
  },
};
