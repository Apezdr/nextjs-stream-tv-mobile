import { Image, ImageProps } from "expo-image";
import React, { useMemo, useCallback } from "react";

import { getAxiosInstance } from "@/src/data/api/axiosClient";

interface OptimizedImageProps extends Omit<ImageProps, "source"> {
  /** The original image URL */
  source: string | { uri: string } | undefined;
  /** Width for optimization (defaults to 256) */
  width?: number;
  /** Quality for optimization (1-100, defaults to 80) */
  quality?: number;
  /** Whether to use optimization (defaults to true) */
  optimize?: boolean;
  /** Priority for loading (defaults to normal) */
  priority?: "low" | "normal" | "high";
}

// Next.js standard width values - moved outside component to avoid recreation
const VALID_WIDTHS = [
  16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048,
  3840,
] as const;

// The server's `images.qualities` allow-list: Next 16 rejects any other `q`
// (the optimizer answers 400 and only the blurhash placeholder ever shows).
// Mirrors nextjs-stream/src/utils/imageQualities.js.
const VALID_QUALITIES = [25, 50, 75, 90, 100] as const;

/**
 * Simple wrapper around expo-image that optionally routes images through Next.js optimization
 */
const OptimizedImage: React.FC<OptimizedImageProps> = ({
  source,
  width = 256,
  quality = 75,
  optimize = true,
  priority = "normal",
  ...imageProps
}) => {
  // Extract URI from source - memoized
  const imageUri = useMemo((): string | undefined => {
    if (!source) return undefined;
    return typeof source === "string" ? source : source.uri;
  }, [source]);

  // Get the nearest valid Next.js width - memoized callback
  const getValidWidth = useCallback((requestedWidth: number): number => {
    // Find the smallest valid width that's >= requested width
    const validWidth = VALID_WIDTHS.find((w) => w >= requestedWidth);
    // If requested width is larger than largest valid width, use the largest
    return validWidth || VALID_WIDTHS[VALID_WIDTHS.length - 1];
  }, []);

  // Check if image is SVG - memoized
  const isSvg = useMemo((): boolean => {
    if (!imageUri) return false;
    // Check file extension
    const url = imageUri.toLowerCase();
    return url.includes(".svg") || url.includes("image/svg");
  }, [imageUri]);

  // Build optimized URL - memoized
  const finalSource = useMemo((): string | undefined => {
    if (!imageUri || !optimize || isSvg) return imageUri;

    const baseURL = getAxiosInstance().defaults.baseURL;
    if (!baseURL) return imageUri;

    try {
      const validWidth = getValidWidth(width);
      // The smallest allowed quality at or above the requested one.
      const validQuality =
        VALID_QUALITIES.find((q) => q >= quality) ??
        VALID_QUALITIES[VALID_QUALITIES.length - 1];
      const encodedUri = encodeURIComponent(imageUri);
      return `${baseURL}/_next/image?url=${encodedUri}&w=${validWidth}&q=${validQuality}`;
    } catch {
      return imageUri;
    }
  }, [imageUri, optimize, isSvg, width, quality, getValidWidth]);

  // No Image.prefetch here: the view below loads this same URL at once. On
  // Android a prefetch is a second Glide job with a different cache key, so
  // it downloaded every image twice and decoded a full-size copy into the
  // memory cache for nothing.

  // Create a stable recycling key based on the URI to help with caching
  const recyclingKey = useMemo(() => {
    if (!finalSource) return undefined;
    return finalSource;
  }, [finalSource]);

  return (
    <Image
      source={finalSource ? { uri: finalSource } : undefined}
      recyclingKey={recyclingKey}
      priority={priority}
      transition={300}
      {...imageProps}
    />
  );
};

export default React.memo(OptimizedImage);
