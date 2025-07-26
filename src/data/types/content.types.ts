/**
 * Type definitions for content based on the actual API structure
 */

// Watch history data structure
export interface WatchHistory {
  playbackTime: number;
  lastWatched: string;
  isWatched: boolean;
  normalizedVideoId: string;
}

// Core media item as returned by the API
export interface MediaItem {
  id: string;
  title: string;
  posterURL?: string;
  posterBlurhash?: string; // data:image/png;base64, encoded blurhash for poster
  thumbnail?: string; // Thumbnail URL (optional, for episodes)
  thumbnailBlurhash?: string; // data:image/png;base64, encoded blurhash for thumbnail
  type: "movie" | "tv";
  backdrop: string;
  backdropBlurhash?: string; // data:image/png;base64, encoded blurhash for backdrop
  lastWatchedDate: string;
  link: string;
  hdr?: string; // HDR format (e.g., "HDR10", "10-bit SDR (BT.709)")
  logo?: string; // Logo URL (typically for TV shows)
  episodeNumber?: number; // For TV shows
  seasonNumber?: number; // For TV shows
  watchHistory?: WatchHistory; // Optional watch history data
}

// Response from horizontal-list endpoint
export interface ContentListResponse {
  currentItems: MediaItem[];
  previousItem: MediaItem | null;
  nextItem: MediaItem | null;
}

// Parameters for horizontal-list endpoint
export interface HorizontalListParams {
  type?:
    | "movie"
    | "tv"
    | "recentlyWatched"
    | "recentlyAdded"
    | "recommendations"
    | "all";
  sort?: "id" | "title" | "date";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
  includeWatchHistory?: boolean; // Optional parameter to include watch history
  isTVdevice?: boolean; // Optional parameter to specify if the request is from a TV device
}

// Episode picker response structure
export interface EpisodePickerResponse {
  // This would need to be defined based on the actual API response
  // for the episode-picker endpoint
  [key: string]: unknown;
}

// Parameters for episode-picker endpoint
export interface EpisodePickerParams {
  title: string;
  season: number;
}

// Enhanced TV Device Response Types
export interface TVDeviceEpisode {
  episodeNumber: number;
  title: string;
  thumbnail: string;
  thumbnailBlurhash: string;
  duration: number;
  description: string;
  videoURL: string;
  hdr: string;
  dimensions: string;
  watchHistory?: WatchHistory; // Optional watch history data for episodes
}

export interface TVDeviceMetadata {
  overview: string;
  genres: Array<{
    id: number;
    name: string;
  }>;
  rating: number;
  releaseDate: string;
  trailer_url: string;
}

export interface TVDeviceNavigation {
  seasons: {
    current: number;
    total: number;
    hasPrevious: boolean;
    hasNext: boolean;
  };
}

export interface TVDeviceMediaResponse {
  id: string;
  title: string;
  type: string;
  posterURL: string;
  backdrop: string;
  posterBlurhash: string;
  backdropBlurhash: string; // data:image/png;base64, encoded blurhash for backdrop
  metadata: TVDeviceMetadata;
  availableSeasons: number[];
  totalSeasons: number;
  logo?: string; // Logo URL (typically for TV shows)
  seasonNumber: number;
  episodes: TVDeviceEpisode[];
  navigation: TVDeviceNavigation;
  airDate?: string; // Air date for TV shows
  duration?: number; // Duration in seconds (for movies or episodes)
  watchHistory?: WatchHistory; // Optional watch history data
}

// Media details response (from /media endpoint)
export interface MediaDetailsResponse {
  id?: string;
  title?: string;
  link?: string; // Path to media content (legacy field)
  videoURL?: string; // Full URL to video content (current API field)
  posterURL?: string; // Poster image URL
  backdrop?: string; // Backdrop image URL
  hdr?: string; // HDR format (e.g., "HDR10", "10-bit SDR (BT.709)")
  logo?: string; // Logo URL (typically for TV shows)
  type?: "movie" | "tv"; // Content type
  duration?: number; // Duration in seconds
  releaseDate?: string; // Release date
  description?: string; // Content description
  episodeNumber?: number; // For TV shows
  seasonNumber?: number; // For TV shows
  lastWatchedDate?: string; // When the content was last watched
  overview: string; // Overview of the content
  watchHistory?: WatchHistory; // Optional watch history data
  metadata?: {
    overview?: string; // Overview of the content
    rating?: string; // Content rating (e.g., "PG-13")
    release_date?: string; // Release date
    genres?: [
      {
        id: number; // Genre ID
        name: string; // Genre name
      },
    ];
    [key: string]: unknown; // Additional metadata fields
  };
  mediaQuality?: {
    format?: string; // Video format (e.g., "8-bit SDR (BT.709)", "HDR10")
    bitDepth?: number; // Bit depth (e.g., 8, 10)
    colorSpace?: string; // Color space (e.g., "YUV")
    transferCharacteristics?: string; // Transfer characteristics (e.g., "BT.709")
    isHDR?: boolean; // Whether the content is HDR
    viewingExperience?: {
      enhancedColor?: boolean; // Whether the content has enhanced color
      highDynamicRange?: boolean; // Whether the content has high dynamic range
      dolbyVision?: boolean; // Whether the content supports Dolby Vision
      hdr10Plus?: boolean; // Whether the content supports HDR10+
      standardHDR?: boolean; // Whether the content is standard HDR
    };
    [key: string]: unknown; // Additional media quality fields
  };
  cast?: [
    {
      character?: string; // Character name
      id?: number; // Actor ID
      name?: string; // Actor name
      profile_path?: string; // Actor profile image URL
      [key: string]: unknown; // Additional cast fields
    },
  ];
  // Additional fields that might be returned by the API
  [key: string]: unknown;
}

// Parameters for media endpoint
export interface MediaParams {
  mediaType: string;
  mediaTitle?: string;
  mediaId?: string;
  season?: number;
  episode?: number;
  card?: boolean;
  isTVdevice?: boolean; // New parameter for enhanced TV responses
  includeWatchHistory?: boolean; // Optional parameter to include watch history
}

// Content count response
export interface MediaCountResponse {
  // When type=recentlyWatched
  hasWatchHistory?: boolean;
  count?: number;

  // Default response
  moviesCount?: number;
  tvShowsCount?: number;
  total?: number;
  movieHours?: number;
  tvHours?: number;
  totalHours?: number;
}

// Parameters for subtitles endpoint
export interface SubtitlesParams {
  name: string;
  language: string;
  type: "movie" | "tv";
  season?: number; // Required for TV
  episode?: number; // Required for TV
}

// Parameters for thumbnails endpoint
export interface ThumbnailsParams {
  name: string;
  type: "movie" | "tv";
  season?: number; // Required for TV
  episode?: number; // Required for TV
}

// Parameters for chapter endpoint
export interface ChapterParams {
  name: string;
  type: "movie" | "tv";
  season?: number; // Required for TV
  episode?: number; // Required for TV
}

// Banner response (for landing page) - array of banner items
export type BannerResponse = BannerItem[];

export interface BannerItem {
  title: string;
  type: string;
  backdrop: string;
  backdropBlurhash: string;
  logo: string;
  id: string;
  clipVideoURL?: string; // Optional video clip URL for enhanced banner experience
  metadata: {
    trailer_url: string;
    overview: string;
    genres: Array<{
      id: number;
      name: string;
    }>;
    vote_average: number;
    release_date: string;
  };
}

// Contrast analysis for screensaver
export interface ContrastAnalysis {
  needsAdjustment: boolean;
  recommendedOverlay?: {
    color: string;
    opacity: number;
  };
  logoLuminance?: number;
  backdropLuminance?: number;
  contrastRatio?: number;
  logoHasTransparency?: boolean;
  logoTransparencyRatio?: number;
  backdropDominantArea?: "dark" | "light" | "mixed";
  backdropHasContrastingRegions?: boolean;
  regionLuminances?: number[];
  contrastThreshold?: number;
  imageSources?: {
    logo?: "cache" | "remote" | "unknown";
    backdrop?: "cache" | "remote" | "unknown";
  };
}

// Animation placement for screensaver
export interface AnimationPlacement {
  verticalPosition: "top" | "center" | "bottom";
  horizontalPosition: "left" | "center" | "right";
  startSide: "left" | "right" | "top" | "bottom";
  animationPath: "linear" | "curved" | "wave" | "diagonal";
  contrastRatios?: {
    [key: string]: number;
  };
  regionLuminances?: {
    [key: string]: number;
  };
  horizontalContrast?: boolean;
  luminanceVariance?: number;
  reason?: string;
}

// Screensaver response
export interface ScreensaverResponse {
  _id: string; // Always available unique identifier
  type: "movie" | "tv"; // Always available content type
  title: string;
  logo?: string;
  backdrop: string;
  backdropBlurhash?: string; // Optional blurhash for backdrop
  network?: {
    name: string;
    logo_url: string;
  };
  contrastAnalysis?: ContrastAnalysis;
  animationPlacement?: AnimationPlacement;
}

// Sync validation update request
export interface SyncValidationUpdateRequest {
  videoId: string;
  isValid: boolean;
}

// Type aliases for commonly used content list types
export type ContentListType = HorizontalListParams["type"];

// Enhanced content selection options for UI components
export interface ContentSelectionOptions {
  shows: Array<{ label: string; value: string }>;
  seasons: Array<{ label: string; value: number }>;
  episodes: Array<{
    id: string;
    title: string;
    videoURL: string;
  }>;
}

// Genre-related types for the genres API
export interface Genre {
  id: number;
  name: string;
  movieCount?: number;
  tvShowCount?: number;
  totalCount?: number;
}

// Response from genres list endpoint (action=list)
export interface GenresListResponse {
  availableGenres: Genre[];
  totalGenres: number;
  mediaTypeCounts: {
    movies: number;
    tvShows: number;
    total: number;
  };
  filters: {
    type: "all" | "movie" | "tv";
    includeCounts: boolean;
  };
}

// Parameters for genres list endpoint
export interface GenresListParams {
  action?: "list";
  type?: "all" | "movie" | "tv";
  includeCounts?: boolean;
  isTVdevice?: boolean;
}

// Response from genres content endpoint (action=content)
export interface GenresContentResponse {
  currentItems: MediaItem[];
  previousItem: MediaItem | null;
  nextItem: MediaItem | null;
  genreInfo: {
    requestedGenres: string[];
    totalResults: number;
    currentPage: number;
    totalPages: number;
  };
  filters: {
    type: "all" | "movie" | "tv";
    sort: "newest" | "oldest" | "title" | "rating";
    sortOrder: "asc" | "desc";
  };
}

// Parameters for genres content endpoint
export interface GenresContentParams {
  action: "content";
  genre: string; // Genre name(s), comma-separated for multiple
  type?: "all" | "movie" | "tv";
  page?: number;
  limit?: number;
  sort?: "newest" | "oldest" | "title" | "rating";
  sortOrder?: "asc" | "desc";
  includeWatchHistory?: boolean;
  isTVdevice?: boolean;
}

// Combined genres API parameters
export type GenresApiParams = GenresListParams | GenresContentParams;
