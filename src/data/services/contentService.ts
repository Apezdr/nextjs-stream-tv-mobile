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
} from "@/src/data/types/content.types";

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

    const queryParams = buildQueryParams({
      type,
      sort,
      sortOrder,
      page,
      limit,
    });

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
    await enhancedApiClient.post(API_ENDPOINTS.SYSTEM.UPDATE_PLAYBACK, data);
  },
};
