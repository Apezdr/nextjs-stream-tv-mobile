/**
 * Utility functions for handling YouTube URLs and generating thumbnails
 */

/**
 * Extract YouTube video ID from various YouTube URL formats
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * - https://youtube.com/watch?v=VIDEO_ID
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;

  // Regular expression to match various YouTube URL formats
  const regExp =
    /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);

  if (match && match[7].length === 11) {
    return match[7];
  }

  return null;
}

/**
 * Generate YouTube thumbnail URL from video ID
 * Uses maxresdefault for highest quality, falls back to hqdefault if not available
 */
export function getYouTubeThumbnailUrl(
  videoId: string,
  quality:
    | "maxresdefault"
    | "hqdefault"
    | "mqdefault"
    | "sddefault" = "maxresdefault",
): string {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

/**
 * Get YouTube watch URL from video ID
 */
export function getYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Check if a URL is a valid YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
  if (!url) return false;
  return extractYouTubeVideoId(url) !== null;
}

/**
 * Generate YouTube thumbnail with fallback options
 * Returns an object with primary and fallback thumbnail URLs
 */
export function getYouTubeThumbnailUrls(videoId: string) {
  return {
    primary: getYouTubeThumbnailUrl(videoId, "maxresdefault"),
    fallback: getYouTubeThumbnailUrl(videoId, "hqdefault"),
    medium: getYouTubeThumbnailUrl(videoId, "mqdefault"),
    standard: getYouTubeThumbnailUrl(videoId, "sddefault"),
  };
}
