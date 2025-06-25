/**
 * Cache configuration and key definitions
 */

// Cache TTL (Time To Live) constants
export const CACHE_CONFIG = {
  // Short TTL for content that changes frequently
  SHORT_TTL: 2 * 60 * 1000, // 2 minutes (increased from 30 seconds)

  // Medium TTL for content that changes occasionally
  MEDIUM_TTL: 10 * 60 * 1000, // 10 minutes (increased from 5 minutes)

  // Longer TTL for static content
  LONG_TTL: 30 * 60 * 1000, // 30 minutes

  // Default is to enable caching
  DEFAULT_ENABLED: true,
};

// Cache key patterns for consistent cache management
export const CACHE_KEYS = {
  // Content-related cache keys
  HORIZONTAL_LIST: (type: string, sort?: string, sortOrder?: string) =>
    `horizontal-list:${type}:${sort || "id"}:${sortOrder || "desc"}`,

  MEDIA: (mediaType: string, identifier: string) =>
    `media:${mediaType}:${identifier}`,

  EPISODE_PICKER: (title: string, season: number) =>
    `episode-picker:${title}:${season}`,

  CONTENT_COUNT: (type?: string) => `content-count${type ? `:${type}` : ""}`,

  BANNER: "banner",

  // Notification-related cache keys
  NOTIFICATIONS: (page: number, limit: number, unreadOnly: boolean) =>
    `notifications:${page}:${limit}:${unreadOnly}`,

  UNREAD_COUNT: "unread-count",

  // System-related cache keys
  SYSTEM_STATUS: "system-status",

  // Admin-related cache keys (longer TTL typically)
  ADMIN_MEDIA: "admin:media",
  ADMIN_USERS: "admin:users",
  ADMIN_RECENTLY_WATCHED: "admin:recently-watched",
  ADMIN_SERVERS: "admin:servers",
  ADMIN_SERVER_LOAD: "admin:server-load",
  ADMIN_SYNC_VERIFICATION: "admin:sync-verification",
};

// Cache configuration per data type
export const CACHE_SETTINGS = {
  // Frequently changing content - use short TTL
  HORIZONTAL_LIST: {
    ttl: CACHE_CONFIG.SHORT_TTL,
    enabled: CACHE_CONFIG.DEFAULT_ENABLED,
  },

  // Media details - medium TTL since they don't change often
  MEDIA: {
    ttl: CACHE_CONFIG.MEDIUM_TTL,
    enabled: CACHE_CONFIG.DEFAULT_ENABLED,
  },

  // Episode data - medium TTL
  EPISODE_PICKER: {
    ttl: CACHE_CONFIG.MEDIUM_TTL,
    enabled: CACHE_CONFIG.DEFAULT_ENABLED,
  },

  // System status - short TTL for real-time info
  SYSTEM_STATUS: {
    ttl: CACHE_CONFIG.SHORT_TTL,
    enabled: CACHE_CONFIG.DEFAULT_ENABLED,
  },

  // Notifications - short TTL for timely updates
  NOTIFICATIONS: {
    ttl: CACHE_CONFIG.SHORT_TTL,
    enabled: CACHE_CONFIG.DEFAULT_ENABLED,
  },

  // Admin data - longer TTL since it's accessed less frequently
  ADMIN: {
    ttl: CACHE_CONFIG.LONG_TTL,
    enabled: CACHE_CONFIG.DEFAULT_ENABLED,
  },
};
