/**
 * Centralized API endpoint definitions
 */

export const API_ENDPOINTS = {
  // Authentication endpoints
  AUTH: {
    REGISTER_SESSION: "/api/auth/register-session",
    CHECK_TOKEN: "/api/auth/check-token",
    USER_STATUS: "/api/auth/user-status",
    NATIVE_SIGNIN: (providerId: string) => `/native-signin/${providerId}`,
    // QR Code Authentication
    REGISTER_QR_SESSION: "/api/auth/register-qr-session",
    QR_SESSION_INFO: "/api/auth/qr-session-info",
    AUTHENTICATE_QR_SESSION: "/api/auth/authenticate-qr-session",
    CHECK_QR_TOKEN: "/api/auth/check-qr-token",
  },

  // Content-related endpoints
  CONTENT: {
    HORIZONTAL_LIST: "/api/authenticated/horizontal-list",
    EPISODE_PICKER: "/api/authenticated/episode-picker",
    LIST: "/api/authenticated/list",
    COUNT: "/api/authenticated/count",
    MEDIA: "/api/authenticated/media",
    SUBTITLES: "/api/authenticated/subtitles",
    THUMBNAILS: "/api/authenticated/thumbnails",
    CHAPTER: "/api/authenticated/chapter",
    BANNER: "/api/authenticated/banner",
    SCREENSAVER: "/api/authenticated/screensaver",
    GENRES: "/api/authenticated/genres",
    WATCHLIST: "/api/authenticated/watchlist",
    WATCHLIST_CONTENT: "/api/authenticated/watchlist-content",
    SEARCH: "/api/authenticated/search",
    CALENDAR: (endpoint: "sonarr" | "radarr") =>
      `/api/authenticated/calendar/${endpoint}`,
  },

  // Notification endpoints
  NOTIFICATIONS: {
    LIST: "/api/authenticated/notifications",
    MARK_READ: "/api/authenticated/notifications/mark-read",
    DISMISS: "/api/authenticated/notifications/dismiss",
  },

  // System endpoints
  SYSTEM: {
    STATUS: "/api/authenticated/system-status",
    SYNC_VALIDATION: "/api/authenticated/sync/updateValidationStatus",
    UPDATE_PLAYBACK: "/api/authenticated/sync/updatePlayback",
  },

  // Admin endpoints
  ADMIN: {
    MEDIA: "/api/authenticated/admin/media",
    USERS: "/api/authenticated/admin/users",
    USER_RECENTLY_WATCHED: (userId: string) =>
      `/api/authenticated/admin/user-recently-watched/${userId}`,
    RECENTLY_WATCHED: "/api/authenticated/admin/recently-watched",
    LAST_SYNCED: "/api/authenticated/admin/lastsynced",
    SABNZBD: "/api/authenticated/admin/sabnzbd",
    RADARR: "/api/authenticated/admin/radarr",
    SONARR: "/api/authenticated/admin/sonarr",
    TDARR: "/api/authenticated/admin/tdarr",
    SERVERS: "/api/authenticated/admin/servers",
    DOCKERHUB: "/api/authenticated/admin/dockerhub-lastupdated",
    SERVER_LOAD: "/api/authenticated/admin/server-load",
    SERVER_PROCESSES: "/api/authenticated/admin/server-processes",
    SYNC_VERIFICATION: "/api/authenticated/admin/sync-verification",
    SYNC: "/api/authenticated/admin/sync",
    SYSTEM_STATUS_NOTIFICATION:
      "/api/authenticated/admin/system-status-notification",
    WIPE_DB: "/api/authenticated/admin/wipe-db",
  },
};

// Helper function to build query parameters
export function buildQueryParams(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, value.toString());
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}
