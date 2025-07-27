import { Ionicons } from "@expo/vector-icons";

export interface NavigationRoute {
  key: string;
  title: string;
  path: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconOnly?: boolean;
}

export const NAVIGATION_ROUTES: NavigationRoute[] = [
  {
    key: "search",
    title: "Search",
    path: "/(tv)/(protected)/(browse)/search",
    icon: "search",
    iconOnly: true,
  },
  {
    key: "home",
    title: "Home",
    path: "/(tv)/(protected)/(browse)/",
  },
  {
    key: "shows",
    title: "Shows",
    path: "/(tv)/(protected)/(browse)/tv-shows",
  },
  {
    key: "movies",
    title: "Movies",
    path: "/(tv)/(protected)/(browse)/movies",
  },
  {
    key: "my-list",
    title: "My List",
    path: "/(tv)/(protected)/(browse)/my-list",
  },
];

export const TOP_NAV_CONFIG = {
  HEIGHT: 80 as number,
  HEIGHT_COLLAPSED: 55 as number, // HEIGHT - 25
  FOCUS_DELAY: 2000 as number, // 2 seconds auto-navigation delay
  ANIMATION_DURATION: 300 as number,
  PROFILE_DROPDOWN_WIDTH: 200 as number,
} as const;

export interface ProfileDropdownItem {
  key: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  action: "switch-profiles" | "sign-out" | "exit-app";
}

export const PROFILE_DROPDOWN_ITEMS: ProfileDropdownItem[] = [
  {
    key: "switch-profiles",
    title: "Switch Profiles",
    icon: "people",
    action: "switch-profiles",
  },
  {
    key: "sign-out",
    title: "Sign Out",
    icon: "log-out",
    action: "sign-out",
  },
  {
    key: "exit-app",
    title: "Exit App",
    icon: "exit",
    action: "exit-app",
  },
];
