import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { MobileContentCardData } from "@/src/components/Mobile/Cards/MobileContentCard";
import MobileContentRow from "@/src/components/Mobile/Rows/MobileContentRow";
import { queryKeys } from "@/src/data/query/queryKeys";
import { contentService } from "@/src/data/services/contentService";
import { MediaItem } from "@/src/data/types/content.types";

interface MobileGenreRowProps {
  genre: string;
  type: "movie" | "tv";
  onPlayContent: (
    showId: string,
    mediaType: "movie" | "tv",
    seasonNumber?: number,
    episodeNumber?: number,
    backdropUrl?: string,
    backdropBlurhash?: string,
  ) => void;
  onInfoContent: (
    showId: string,
    mediaType: "movie" | "tv",
    seasonNumber?: number,
    episodeNumber?: number,
    backdropUrl?: string,
    backdropBlurhash?: string,
  ) => void;
  limit?: number;
  cardSize?: "small" | "medium" | "large";
  showMoreButton?: boolean;
  onShowMore?: (genre: string) => void;
  enabled?: boolean;
}

export default function MobileGenreRow({
  genre,
  type,
  onPlayContent,
  onInfoContent,
  limit = 20,
  cardSize = "medium",
  showMoreButton = false,
  onShowMore,
  enabled = true,
}: MobileGenreRowProps) {
  // Single infinite query for this genre
  const {
    data: genreData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: queryKeys.genreContent({
      genre,
      type,
      limit,
      sort: "newest",
      sortOrder: "desc",
    }),
    queryFn: async ({ pageParam = 0 }) => {
      console.log(
        `[MobileGenreRow] Fetching genre: ${genre}, page: ${pageParam}, limit: ${limit}`,
      );

      const result = await contentService.getGenreContent({
        action: "content",
        genre,
        type,
        page: pageParam as number,
        limit,
        sort: "newest",
        sortOrder: "desc",
        includeWatchHistory: true,
        isTVdevice: false,
      });

      console.log(`[MobileGenreRow] ${genre} response:`, {
        currentItemsCount: result.currentItems?.length || 0,
        hasNextItem: !!result.nextItem,
        nextItem: result.nextItem,
        page: pageParam,
      });

      return result;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const nextPage = lastPage?.nextItem ? allPages.length : undefined;

      console.log(`[MobileGenreRow] ${genre} getNextPageParam:`, {
        hasNextItem: !!lastPage?.nextItem,
        currentItemsCount: lastPage.currentItems?.length || 0,
        totalPages: allPages.length,
        nextPage,
      });

      return nextPage;
    },
    enabled: enabled && !!genre,
  });

  // Transform MediaItem to MobileContentCardData
  const transformMediaItems = useCallback(
    (items: MediaItem[] = []): MobileContentCardData[] => {
      return items.map((item) => ({
        id: item.id,
        title: item.title,
        thumbnailUrl: item.thumbnailUrl || item.posterURL,
        thumbnailBlurhash: item.thumbnailBlurhash || item.posterBlurhash,
        backdropUrl: item.backdropUrl || item.backdrop,
        backdropBlurhash: item.backdropBlurhash,
        mediaType: item.type,
        seasonNumber: item.seasonNumber,
        episodeNumber: item.episodeNumber,
        showId: item.id,
        hdr: item.hdr,
        logo: item.logo,
      }));
    },
    [],
  );

  // Flatten the paginated data for this genre
  const items = useMemo(() => {
    if (!genreData?.pages) return [];
    const flattened = genreData.pages.flatMap(
      (page) => page.currentItems || [],
    );

    console.log(`[MobileGenreRow] ${genre} flattened items:`, {
      totalPages: genreData.pages.length,
      totalItems: flattened.length,
      hasNextPage,
      isFetching: isFetchingNextPage,
    });

    return flattened;
  }, [genreData?.pages, genre, hasNextPage, isFetchingNextPage]);

  // Transform items to card data
  const cardData = useMemo(() => {
    return transformMediaItems(items);
  }, [items, transformMediaItems]);

  // Handle load more for infinite scroll
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      console.log(`[MobileGenreRow] ${genre} fetchNextPage called`, {
        hasNextPage,
        isFetching: isFetchingNextPage,
      });
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, genre]);

  // Handle show more
  const handleShowMore = useCallback(() => {
    if (onShowMore) {
      onShowMore(genre);
    }
  }, [onShowMore, genre]);

  // Expose refetch function for parent components
  const handleRefetch = useCallback(() => {
    refetch();
  }, [refetch]);

  // Add refetch to the component for external access
  (MobileGenreRow as any).refetch = handleRefetch;

  return (
    <MobileContentRow
      title={genre}
      data={cardData}
      onPlayContent={onPlayContent}
      onInfoContent={onInfoContent}
      cardSize={cardSize}
      showMoreButton={showMoreButton}
      onShowMore={showMoreButton ? handleShowMore : undefined}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onLoadMore={handleLoadMore}
      loading={isLoading}
      emptyMessage={`No ${type === "movie" ? "movies" : "shows"} found in ${genre}`}
    />
  );
}

// Export a version with refetch capability for external use
export const MobileGenreRowWithRefetch = MobileGenreRow;
