import { Image, ImageProps } from "expo-image";
import React, { useEffect, useMemo, useCallback } from "react";

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
      const encodedUri = encodeURIComponent(imageUri);
      return `${baseURL}/_next/image?url=${encodedUri}&w=${validWidth}&q=${quality}`;
    } catch {
      return imageUri;
    }
  }, [imageUri, optimize, isSvg, width, quality, getValidWidth]);

  // Prefetch the optimized image when component mounts
  useEffect(() => {
    if (finalSource) {
      Image.prefetch(finalSource).catch(() => {
        // Silently handle prefetch errors - the image will still load normally
      });
    }
  }, [finalSource]);

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
