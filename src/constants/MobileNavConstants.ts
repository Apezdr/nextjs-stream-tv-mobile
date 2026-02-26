import { Ionicons } from "@expo/vector-icons";

export interface MobileNavigationRoute {
  key: string;
  title: string;
  path: string;
  icon: keyof typeof Ionicons.glyphMap;
  focusedIcon?: keyof typeof Ionicons.glyphMap;
}

export const MOBILE_NAVIGATION_ROUTES: MobileNavigationRoute[] = [
  {
    key: "home",
    title: "Home",
    path: "index",
    icon: "home-outline",
    focusedIcon: "home",
  },
  {
    key: "movies",
    title: "Movies",
    path: "movies",
    icon: "film-outline",
    focusedIcon: "film",
  },
  {
    key: "shows",
    title: "Shows",
    path: "shows",
    icon: "tv-outline",
    focusedIcon: "tv",
  },
  {
    key: "search",
    title: "Search",
    path: "search",
    icon: "search-outline",
    focusedIcon: "search",
  },
  {
    key: "my-list",
    title: "My List",
    path: "my-list",
    icon: "bookmark-outline",
    focusedIcon: "bookmark",
  },
  {
    key: "profile",
    title: "Profile",
    path: "profile",
    icon: "person-outline",
    focusedIcon: "person",
  },
];

export const MOBILE_TAB_CONFIG = {
  TAB_BAR_HEIGHT: 80,
  TAB_BAR_PADDING: 10,
  ICON_SIZE: 24,
  LABEL_FONT_SIZE: 12,
  BORDER_RADIUS: 0,
} as const;

// Mobile-specific colors for tabs
export const MOBILE_TAB_COLORS = {
  ACTIVE_BACKGROUND: "#1C1C1C", // Dark gray background for active tab
  ACTIVE_TINT: "#E50914", // Netflix red
  INACTIVE_TINT: "#8C8C8C", // Gray
  BACKGROUND: "#000000", // Black background
  BORDER: "#1C1C1C", // Dark gray border
} as const;
