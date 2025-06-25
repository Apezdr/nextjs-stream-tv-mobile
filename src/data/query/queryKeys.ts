/**
 * Type-safe query keys factory for React Query
 * This ensures consistent key structure and makes cache invalidation easier
 */

export const queryKeys = {
  all: ["api"] as const,

  // Auth-related queries
  auth: () => [...queryKeys.all, "auth"] as const,
  authSession: (sessionId: string) =>
    [...queryKeys.auth(), "session", sessionId] as const,
  authToken: () => [...queryKeys.auth(), "token"] as const,
  userStatus: () => [...queryKeys.auth(), "userStatus"] as const,

  // Content queries
  content: () => [...queryKeys.all, "content"] as const,

  // Horizontal list queries
  contentList: (params: {
    type?: string;
    sort?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
  }) => [...queryKeys.content(), "list", params] as const,

  // Infinite content list queries
  infiniteContentList: (params: {
    type?: string;
    sort?: string;
    sortOrder?: string;
    limit?: number;
  }) => [...queryKeys.content(), "infiniteList", params] as const,

  // Episode picker queries
  episodePicker: (title: string, season: number) =>
    [...queryKeys.content(), "episodePicker", title, season] as const,

  // Media details queries
  media: (mediaType: string, identifier: string) =>
    [...queryKeys.content(), "media", mediaType, identifier] as const,

  // Content count queries
  contentCount: (type?: string) =>
    [...queryKeys.content(), "count", type || "all"] as const,

  // Banner and screensaver
  banner: () => [...queryKeys.content(), "banner"] as const,
  screensaver: () => [...queryKeys.content(), "screensaver"] as const,

  // Subtitles, thumbnails, chapters
  subtitles: (params: {
    name: string;
    language?: string;
    type: string;
    season?: number;
    episode?: number;
  }) => [...queryKeys.content(), "subtitles", params] as const,

  thumbnails: (params: {
    name: string;
    type: string;
    season?: number;
    episode?: number;
  }) => [...queryKeys.content(), "thumbnails", params] as const,

  chapters: (params: {
    name: string;
    type: string;
    season?: number;
    episode?: number;
  }) => [...queryKeys.content(), "chapters", params] as const,

  // Calendar queries
  calendar: (endpoint: "sonarr" | "radarr") =>
    [...queryKeys.content(), "calendar", endpoint] as const,

  // Notification queries
  notifications: () => [...queryKeys.all, "notifications"] as const,
  notificationList: (page: number, limit: number, unreadOnly: boolean) =>
    [
      ...queryKeys.notifications(),
      "list",
      { page, limit, unreadOnly },
    ] as const,
  notificationUnreadCount: () =>
    [...queryKeys.notifications(), "unreadCount"] as const,

  // System queries
  system: () => [...queryKeys.all, "system"] as const,
  systemStatus: () => [...queryKeys.system(), "status"] as const,

  // Admin queries
  admin: () => [...queryKeys.all, "admin"] as const,
  adminMedia: () => [...queryKeys.admin(), "media"] as const,
  adminUsers: () => [...queryKeys.admin(), "users"] as const,
  adminRecentlyWatched: (userId?: string) =>
    userId
      ? ([...queryKeys.admin(), "recentlyWatched", userId] as const)
      : ([...queryKeys.admin(), "recentlyWatched"] as const),
  adminServers: () => [...queryKeys.admin(), "servers"] as const,
  adminServerLoad: () => [...queryKeys.admin(), "serverLoad"] as const,
  adminSyncVerification: () =>
    [...queryKeys.admin(), "syncVerification"] as const,
};

// Helper functions for cache invalidation patterns
export const invalidatePatterns = {
  // Invalidate all content-related queries
  allContent: () => queryKeys.content(),

  // Invalidate all auth-related queries
  allAuth: () => queryKeys.auth(),

  // Invalidate all admin queries
  allAdmin: () => queryKeys.admin(),

  // Invalidate all notifications
  allNotifications: () => queryKeys.notifications(),

  // Invalidate specific content type
  contentByType: (type: string) =>
    ["api", "content", "list", { type }] as const,

  // Invalidate specific media
  mediaById: (mediaType: string, identifier: string) =>
    queryKeys.media(mediaType, identifier),
};

// Type-safe query key helpers
export type QueryKeyFactory = typeof queryKeys;
export type InvalidatePatterns = typeof invalidatePatterns;
