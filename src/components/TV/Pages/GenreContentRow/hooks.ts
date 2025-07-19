/**
 * Extracted hooks for GenreContentRow to enable code-splitting
 * These hooks handle the heavy data fetching and processing logic with progressive loading
 */
import { useMemo, useState, useEffect } from "react";

import {
  useInfiniteGenreContent,
  getFlattenedInfiniteGenreData,
} from "@/src/data/hooks/queries/useInfiniteContentQueries";
import { MediaItem } from "@/src/data/types/content.types";

export interface UseGenreContentParams {
  genre: { id: number; name: string; movieCount?: number };
  transformMediaItems: (items: MediaItem[]) => any[];
  loadDelay?: number; // Delay before starting to load this genre's content
}

export function useGenreContentData({
  genre,
  transformMediaItems,
  loadDelay = 0,
}: UseGenreContentParams) {
  const [shouldLoad, setShouldLoad] = useState(loadDelay === 0);

  // Progressive loading effect - delay loading based on loadDelay
  useEffect(() => {
    if (loadDelay > 0 && !shouldLoad) {
      const timer = setTimeout(() => {
        setShouldLoad(true);
      }, loadDelay);

      return () => clearTimeout(timer);
    }
  }, [loadDelay, shouldLoad]);

  // Fetch content for this specific genre using infinite query
  // Only start loading when shouldLoad is true
  const {
    data: genreContentData,
    isLoading: isLoadingGenreContent,
    error: genreContentError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteGenreContent({
    action: "content",
    genre: shouldLoad ? genre.name : "", // Only pass genre name when we should load
    type: "movie",
    limit: 12, // Smaller initial load for TV navigation
    sort: "newest",
    sortOrder: "desc",
    includeWatchHistory: true,
    isTVdevice: true,
  });

  // Transform the genre content data using the flattened helper
  const transformedGenreContent = useMemo(() => {
    if (!shouldLoad) return [];
    const flattenedData = getFlattenedInfiniteGenreData(genreContentData);
    if (!flattenedData.length) return [];
    return transformMediaItems(flattenedData);
  }, [genreContentData, transformMediaItems, shouldLoad]);

  return {
    transformedGenreContent,
    isLoadingGenreContent: shouldLoad ? isLoadingGenreContent : false,
    genreContentError: shouldLoad ? genreContentError : null,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    shouldLoad, // Expose this for conditional rendering
  };
}
