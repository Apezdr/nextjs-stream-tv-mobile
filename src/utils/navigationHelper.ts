import { router, type Href } from "expo-router";
import { Platform } from "react-native";

/**
 * Platform-aware navigation helper (single source of truth).
 *
 * Every method checks `Platform.isTV` at runtime and routes to the
 * appropriate platform prefix:
 *   - TV:     /(tv)/(protected)/...
 *   - Mobile: /(mobile)/(protected)/...
 */

// Route type helpers
type TVWatchRoute = "/(tv)/(protected)/watch/[id]";
type TVMediaInfoRoute = "/(tv)/(protected)/media-info/[id]";
type TVBrowseRoute = `/(tv)/(protected)/(browse)/${string}`;
type TVGenreRoute = "/(tv)/(protected)/(browse)/genre/[type]/[name]";
type MobileWatchRoute = "/(mobile)/(protected)/watch/[id]";
type MobileMediaInfoRoute = "/(mobile)/(protected)/media-info/[id]";
type MobileEpisodeInfoRoute =
  "/(mobile)/(protected)/episode-info/[showId]/[season]/[episode]";
type MobileTabRoute = `/(mobile)/(protected)/(tabs)/${string}`;
type MobileGenreRoute = "/(mobile)/(protected)/genre/[type]/[name]";
type TVCreditsPageRoute = "/(tv)/(protected)/credits";
type TVTitleCreditsRoute = "/(tv)/(protected)/media-info/credits";
type MobileCreditsPageRoute = "/(mobile)/(protected)/credits";

/** Which title's credits to open; `season` + `episode` name an episode. */
export interface TitleCreditsNavigationParams {
  type: "movie" | "tv";
  id: string;
  season?: number;
  episode?: number;
  /** A display name to show before the fresh request answers (TV). */
  title?: string;
}

interface NavigationParams {
  id: string;
  type: string;
  season?: number;
  episode?: number;
  backdrop?: string;
  backdropBlurhash?: string;
  restart?: string;
  [key: string]: any;
}

// Simple navigation logging
const logNavigation = (
  action: string,
  route: string,
  params: any,
  method: "push" | "replace" | "navigate",
) => {
  const platform = Platform.isTV ? "TV" : "MOBILE";
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
  console.log(
    `🔄 [${timestamp}] ${platform}_NAV_${action} (${method.toUpperCase()}): ${route}`,
  );
  console.log(`   Params:`, JSON.stringify(params, null, 2));
};

export const navigationHelper = {
  /**
   * Navigate to watch screen.
   * TV: push with dangerouslySingular to prevent duplicates.
   * Mobile: navigate (replace-style) to prevent video screen accumulation.
   */
  navigateToWatch: (params: NavigationParams) => {
    if (Platform.isTV) {
      const route: TVWatchRoute = "/(tv)/(protected)/watch/[id]";
      logNavigation("WATCH", route, params, "push");
      router.push({ pathname: route, params }, { dangerouslySingular: true });
    } else {
      const route: MobileWatchRoute = "/(mobile)/(protected)/watch/[id]";
      logNavigation("WATCH", route, params, "navigate");
      router.navigate({ pathname: route, params });
    }
  },

  /**
   * Navigate to media info screen.
   * TV: push with dangerouslySingular.
   * Mobile: smart navigation depending on source context.
   */
  navigateToMediaInfo: (
    params: NavigationParams,
    fromEpisodeInfo = false,
    fromWatch = false,
  ) => {
    if (Platform.isTV) {
      const route: TVMediaInfoRoute = "/(tv)/(protected)/media-info/[id]";
      logNavigation("MEDIA_INFO", route, params, "push");
      router.push({ pathname: route, params }, { dangerouslySingular: true });
    } else {
      const route: MobileMediaInfoRoute =
        "/(mobile)/(protected)/media-info/[id]";
      if (fromEpisodeInfo) {
        logNavigation("MEDIA_INFO", route, params, "navigate");
        router.navigate({ pathname: route, params });
      } else if (fromWatch) {
        logNavigation("MEDIA_INFO", route, params, "navigate");
        router.navigate({ pathname: route, params });
      } else {
        logNavigation("MEDIA_INFO", route, params, "push");
        router.push({ pathname: route, params });
      }
    }
  },

  /**
   * Navigate to episode info.
   * TV: no dedicated episode-info screen — route to media-info instead.
   * Mobile: push to the episode-info screen.
   */
  navigateToEpisodeInfo: (params: {
    showId: string;
    season: number;
    episode: number;
    [key: string]: any;
  }) => {
    if (Platform.isTV) {
      const route: TVMediaInfoRoute = "/(tv)/(protected)/media-info/[id]";
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
        { dangerouslySingular: true },
      );
    } else {
      const route: MobileEpisodeInfoRoute =
        "/(mobile)/(protected)/episode-info/[showId]/[season]/[episode]";
      logNavigation("EPISODE_INFO", route, params, "push");
      router.push({ pathname: route as any, params });
    }
  },

  /**
   * Navigate to tab / browse screens.
   * TV: top-nav browse routes.
   * Mobile: tab navigation.
   */
  /**
   * Navigate to a genre screen.
   * TV: push to the TV browse genre route.
   * Mobile: push to the mobile genre route.
   */
  navigateToGenre: (type: "movie" | "tv", genre: string) => {
    if (Platform.isTV) {
      const route: TVGenreRoute =
        "/(tv)/(protected)/(browse)/genre/[type]/[name]";
      logNavigation("GENRE", route, { type, name: genre }, "push");
      router.push({ pathname: route, params: { type, name: genre } });
    } else {
      const route: MobileGenreRoute =
        "/(mobile)/(protected)/genre/[type]/[name]";
      logNavigation("GENRE", route, { type, name: genre }, "push");
      router.push({ pathname: route, params: { type, name: genre } });
    }
  },

  /**
   * Open the Credits & licenses page (the menu item's target).
   * TV: a full-screen route beside media-info. Mobile: a stack screen.
   */
  navigateToCreditsPage: () => {
    if (Platform.isTV) {
      const route: TVCreditsPageRoute = "/(tv)/(protected)/credits";
      logNavigation("CREDITS_PAGE", route, {}, "push");
      router.push(route);
    } else {
      const route: MobileCreditsPageRoute = "/(mobile)/(protected)/credits";
      logNavigation("CREDITS_PAGE", route, {}, "push");
      router.push(route);
    }
  },

  /**
   * Open one title's credits.
   * TV: the full-screen credits view (it reads a handed `Credits` object from
   * creditsViewStore when the key matches, else fetches the title).
   * Mobile: the title's own info screen, scrolled to its credits section;
   * an episode goes to its episode-info screen.
   */
  navigateToTitleCredits: (params: TitleCreditsNavigationParams) => {
    if (Platform.isTV) {
      const route: TVTitleCreditsRoute = "/(tv)/(protected)/media-info/credits";
      // Only the keys that are set: an undefined season must not reach the
      // route as the string "undefined".
      const routeParams: Record<string, string> = {
        type: params.type,
        id: params.id,
      };
      if (params.season !== undefined)
        routeParams.season = String(params.season);
      if (params.episode !== undefined) {
        routeParams.episode = String(params.episode);
      }
      if (params.title) routeParams.title = params.title;
      logNavigation("TITLE_CREDITS", route, routeParams, "push");
      router.push({ pathname: route, params: routeParams });
      return;
    }
    if (params.type === "tv" && params.episode !== undefined) {
      navigationHelper.navigateToEpisodeInfo({
        showId: params.id,
        season: params.season ?? 1,
        episode: params.episode,
        scrollTo: "credits",
      });
      return;
    }
    navigationHelper.navigateToMediaInfo({
      id: params.id,
      type: params.type,
      scrollTo: "credits",
    });
  },

  navigateToTab: (tabName: string, params: Record<string, string> = {}) => {
    if (Platform.isTV) {
      const route = `/(tv)/(protected)/(browse)/${tabName}` as TVBrowseRoute;
      logNavigation("TAB→BROWSE", route, { tabName, ...params }, "push");
      router.push({ pathname: route, params } as any);
    } else {
      const route = `/(mobile)/(protected)/(tabs)/${tabName}` as MobileTabRoute;
      logNavigation("TAB", route, { tabName, ...params }, "push");
      router.push({ pathname: route, params } as Href);
    }
  },
};
