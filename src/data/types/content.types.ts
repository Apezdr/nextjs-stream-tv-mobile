/**
 * Type definitions for content based on the actual API structure
 */

// Core media item as returned by the API
export interface MediaItem {
  id: string;
  title: string;
  posterURL: string;
  type: "movie" | "tv";
  backdrop: string;
  lastWatchedDate: string;
  link: string;
  hdr?: string; // HDR format (e.g., "HDR10", "10-bit SDR (BT.709)")
  logo?: string; // Logo URL (typically for TV shows)
  episodeNumber?: number; // For TV shows
  seasonNumber?: number; // For TV shows
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

// Banner response (for landing page)
export interface BannerResponse {
  // This would need to be defined based on the actual API response
  [key: string]: unknown;
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
