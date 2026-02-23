/**
 * Content service for handling all content-related API operations
 */
import { API_ENDPOINTS, buildQueryParams } from "@/src/data/api/endpoints";
import { enhancedApiClient } from "@/src/data/api/enhancedClient";
import {
  ContentListResponse,
  HorizontalListParams,
  EpisodePickerResponse,
  EpisodePickerParams,
  MediaDetailsResponse,
  MediaParams,
  MediaCountResponse,
  SubtitlesParams,
  ThumbnailsParams,
  ChapterParams,
  BannerResponse,
  ScreensaverResponse,
  SyncValidationUpdateRequest,
  TVDeviceMediaResponse,
  GenresListResponse,
  GenresListParams,
  GenresContentResponse,
  GenresContentParams,
  MediaItem,
} from "@/src/data/types/content.types";
import { generateUserAgent } from "@/src/utils/deviceInfo";

// Environment-controlled debug logging for horizontal list fetches
const HORIZONTAL_LIST_DEBUG_ENABLED =
  process.env.EXPO_PUBLIC_HORIZONTAL_LIST_DEBUG === "true";

/**
 * Debug logger for horizontal list requests
 */
function logHorizontalListRequest(
  source: string,
  endpoint: string,
  queryParams: string,
  params: unknown,
) {
  if (!HORIZONTAL_LIST_DEBUG_ENABLED) return;

  const baseURL = enhancedApiClient.getBaseUrl();
  const fullURL = `${baseURL}${endpoint}${queryParams}`;

  console.log(`[${source}] Horizontal List Request:`, {
    baseURL,
    endpoint,
    queryParams,
    fullURL,
    requestParams: params,
    timestamp: new Date().toISOString(),
  });
}

// Types for playback tracking
export interface PlaybackUpdateRequest {
  videoId: string;
  playbackTime: number;
  mediaMetadata: {
    mediaType: "tv" | "movie";
    mediaId: string;
    showId?: string;
    seasonNumber?: number;
    episodeNumber?: number;
  };
}

export const contentService = {
  /**
   * Fetch a horizontal content list
   */
  getContentList: async (
    params: HorizontalListParams = {},
  ): Promise<ContentListResponse> => {
    const {
      type = "all",
      sort = "id",
      sortOrder = "desc",
      page = 0,
      limit = 30,
    } = params;

    const requestParams = { type, sort, sortOrder, page, limit };
    const queryParams = buildQueryParams(requestParams);

    // Debug logging for horizontal list fetch
    logHorizontalListRequest(
      "contentService.getContentList",
      API_ENDPOINTS.CONTENT.HORIZONTAL_LIST,
      queryParams,
      requestParams,
    );

    // Use regular get method - React Query will handle caching
    return enhancedApiClient.get<ContentListResponse>(
      `${API_ENDPOINTS.CONTENT.HORIZONTAL_LIST}${queryParams}`,
    );
  },

  /**
   * Fetch episode picker data for a specific show and season
   */
  getEpisodePicker: async (
    params: EpisodePickerParams,
  ): Promise<EpisodePickerResponse> => {
    const { title, season } = params;

    const queryParams = buildQueryParams({ title, season });

    // Use regular get method - React Query will handle caching
    return enhancedApiClient.get<EpisodePickerResponse>(
      `${API_ENDPOINTS.CONTENT.EPISODE_PICKER}${queryParams}`,
    );
  },

  /**
   * Fetch all file server data (admin/webhook only)
   */
  getAllContent: async (): Promise<Record<string, unknown>> => {
    return enhancedApiClient.get(API_ENDPOINTS.CONTENT.LIST);
  },

  /**
   * Get content counts and durations
   */
  getContentCounts: async (
    type?: "recentlyWatched",
  ): Promise<MediaCountResponse> => {
    const queryParams = type ? buildQueryParams({ type }) : "";

    return enhancedApiClient.get<MediaCountResponse>(
      `${API_ENDPOINTS.CONTENT.COUNT}${queryParams}`,
    );
  },

  /**
   * Fetch media details
   */
  getMediaDetails: async (
    params: MediaParams,
  ): Promise<MediaDetailsResponse> => {
    const {
      mediaType,
      mediaTitle,
      mediaId,
      season,
      episode,
      card,
      isTVdevice,
      includeWatchHistory,
    } = params;

    const queryParams = buildQueryParams({
      mediaType,
      mediaTitle,
      mediaId,
      season,
      episode,
      card,
      isTVdevice,
      includeWatchHistory,
    });

    // Use regular get method - React Query will handle caching
    return enhancedApiClient.get<MediaDetailsResponse>(
      `${API_ENDPOINTS.CONTENT.MEDIA}${queryParams}`,
    );
  },

  /**
   * Fetch enhanced media details for TV devices
   */
  getTVMediaDetails: async (
    params: Omit<MediaParams, "isTVdevice">,
  ): Promise<TVDeviceMediaResponse> => {
    const {
      mediaType,
      mediaTitle,
      mediaId,
      season,
      episode,
      card,
      includeWatchHistory,
    } = params;

    const queryParams = buildQueryParams({
      mediaType,
      mediaTitle,
      mediaId,
      season,
      episode,
      card,
      isTVdevice: true,
      includeWatchHistory,
    });

    console.log(":::::", `${API_ENDPOINTS.CONTENT.MEDIA}${queryParams}`);

    // Use regular get method - React Query will handle caching
    return enhancedApiClient.get<TVDeviceMediaResponse>(
      `${API_ENDPOINTS.CONTENT.MEDIA}${queryParams}`,
    );
  },

  /**
   * Fetch root show data to get available seasons (TV shows only)
   */
  getRootShowData: async (
    mediaId: string,
    mediaType: "tv",
  ): Promise<TVDeviceMediaResponse> => {
    const queryParams = buildQueryParams({
      mediaType,
      mediaId,
      isTVdevice: true,
    });

    return enhancedApiClient.get<TVDeviceMediaResponse>(
      `${API_ENDPOINTS.CONTENT.MEDIA}${queryParams}`,
    );
  },

  /**
   * Post media details (alternative method)
   */
  postMediaDetails: async (
    data: Pick<MediaParams, "mediaType" | "mediaTitle">,
  ): Promise<MediaDetailsResponse> => {
    return enhancedApiClient.post<MediaDetailsResponse>(
      API_ENDPOINTS.CONTENT.MEDIA,
      data,
    );
  },

  /**
   * Fetch subtitle data
   */
  getSubtitles: async (
    params: SubtitlesParams,
  ): Promise<Record<string, unknown>> => {
    const { name, language, type, season, episode } = params;

    const queryParams = buildQueryParams({
      name,
      language,
      type,
      season,
      episode,
    });

    return enhancedApiClient.get(
      `${API_ENDPOINTS.CONTENT.SUBTITLES}${queryParams}`,
    );
  },

  /**
   * Fetch thumbnail sprite sheet VTT files
   */
  getThumbnails: async (
    params: ThumbnailsParams,
  ): Promise<Record<string, unknown>> => {
    const { name, type, season, episode } = params;

    const queryParams = buildQueryParams({
      name,
      type,
      season,
      episode,
    });

    return enhancedApiClient.get(
      `${API_ENDPOINTS.CONTENT.THUMBNAILS}${queryParams}`,
    );
  },

  /**
   * Fetch chapter data
   */
  getChapters: async (
    params: ChapterParams,
  ): Promise<Record<string, unknown>> => {
    const { name, type, season, episode } = params;

    const queryParams = buildQueryParams({
      name,
      type,
      season,
      episode,
    });

    return enhancedApiClient.get(
      `${API_ENDPOINTS.CONTENT.CHAPTER}${queryParams}`,
    );
  },

  /**
   * Fetch banner media for landing page
   */
  getBanner: async (): Promise<BannerResponse> => {
    // Add isTVdevice=true parameter to expose clipVideoURL field
    const queryParams = buildQueryParams({
      isTVdevice: true,
    });

    // Use regular get method - React Query will handle caching
    return enhancedApiClient.get<BannerResponse>(
      `${API_ENDPOINTS.CONTENT.BANNER}${queryParams}`,
    );
  },

  /**
   * Fetch screensaver content for TV idle mode
   * No caching to ensure different content each time
   *
   * Includes query parameters for:
   * - analyzeContrast: analyze backdrop/logo contrast and suggest overlay adjustments
   * - animationPlacement: determine optimal animation path and positioning
   */
  getScreensaver: async (): Promise<ScreensaverResponse> => {
    const queryParams = buildQueryParams({
      analyzeContrast: true,
      animationPlacement: true,
      preferPosition: "bottom",
    });

    console.log(
      "[contentService] Fetching screensaver with params:",
      queryParams,
    );
    return enhancedApiClient.get<ScreensaverResponse>(
      `${API_ENDPOINTS.CONTENT.SCREENSAVER}${queryParams}`,
    );
  },

  /**
   * Fetch calendar data (iCal format)
   */
  getCalendar: async (endpoint: "sonarr" | "radarr"): Promise<string> => {
    return enhancedApiClient.get<string>(
      API_ENDPOINTS.CONTENT.CALENDAR(endpoint),
    );
  },

  /**
   * Update validation status of a video in watch history
   */
  updateValidationStatus: async (
    params: SyncValidationUpdateRequest,
  ): Promise<void> => {
    await enhancedApiClient.post(API_ENDPOINTS.SYSTEM.SYNC_VALIDATION, params);
  },

  /**
   * Update playback progress for a video
   */
  updatePlaybackProgress: async (
    data: PlaybackUpdateRequest,
  ): Promise<void> => {
    // Generate platform-specific user agent for tracking
    const userAgent = generateUserAgent();

    await enhancedApiClient.post(API_ENDPOINTS.SYSTEM.UPDATE_PLAYBACK, data, {
      headers: {
        "User-Agent": userAgent,
      },
    });
  },

  /**
   * Fetch available genres with optional content counts
   */
  getGenresList: async (
    params: GenresListParams = {},
  ): Promise<GenresListResponse> => {
    const {
      action = "list",
      type = "movie", // Default to movies for the movies page
      includeCounts = true,
      isTVdevice = true, // Enable TV device optimizations
    } = params;

    const queryParams = buildQueryParams({
      action,
      type,
      includeCounts,
      isTVdevice,
    });

    return enhancedApiClient.get<GenresListResponse>(
      `${API_ENDPOINTS.CONTENT.GENRES}${queryParams}`,
    );
  },

  /**
   * Fetch content for a specific genre with pagination
   */
  getGenreContent: async (
    params: GenresContentParams,
  ): Promise<GenresContentResponse> => {
    const {
      action = "content",
      genre,
      type = "movie", // Default to movies for the movies page
      page = 0,
      limit = 30,
      sort = "newest",
      sortOrder = "desc",
      includeWatchHistory = true,
      isTVdevice = true, // Enable TV device optimizations
    } = params;

    const queryParams = buildQueryParams({
      action,
      genre,
      type,
      page,
      limit,
      sort,
      sortOrder,
      includeWatchHistory,
      isTVdevice,
    });

    const endpoint = `${API_ENDPOINTS.CONTENT.GENRES}${queryParams}`;
    const baseURL = enhancedApiClient.getBaseUrl();

    console.log(`[contentService.getGenreContent] Requesting:`, {
      fullURL: `${baseURL}${endpoint}`,
      params: { genre, type, page, limit, sort, sortOrder },
    });

    const response =
      await enhancedApiClient.get<GenresContentResponse>(endpoint);

    console.log(`[contentService.getGenreContent] Response for ${genre}:`, {
      itemsReceived: response.currentItems?.length || 0,
      hasNextItem: !!response.nextItem,
      nextItem: response.nextItem,
    });

    return response;
  },

  /**
   * Search for media content
   */
  search: async (query: string = "", limit?: number): Promise<MediaItem[]> => {
    const endpoint = API_ENDPOINTS.CONTENT.SEARCH;
    const baseURL = enhancedApiClient.getBaseUrl();

    console.log(`[contentService.search] Requesting:`, {
      fullURL: `${baseURL}${endpoint}`,
      query: query || "(empty - recently added)",
      limit,
    });

    const response = await enhancedApiClient.post<{ results: MediaItem[] }>(
      endpoint,
      { query, ...(limit && { limit }) },
    );

    console.log(`[contentService.search] Response:`, {
      itemsReceived: response.results?.length || 0,
      query: query || "(recently added)",
    });

    return response.results || [];
  },
};
