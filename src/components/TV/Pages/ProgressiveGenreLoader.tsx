import { memo, lazy, Suspense } from "react";
import { View } from "react-native";

import GenreRowFallback from "@/src/components/TV/Pages/fallbacks/GenreRowFallback";
import { MediaItem } from "@/src/data/types/content.types";

// Lazy load GenreContentRow for code-splitting
const LazyGenreContentRow = lazy(
  () => import("@/src/components/TV/Pages/GenreContentRow"),
);

interface ProgressiveGenreLoaderProps {
  genres: Array<{
    id: number;
    name: string;
    movieCount?: number;
    tvShowCount?: number;
  }>;
  contentType?: "movie" | "tv";
  onSelectContent: (
    showId: string,
    seasonNumber: number | undefined,
    episodeNumber: number | undefined,
    mediaType: "movie" | "tv",
  ) => void;
  transformMediaItems: (items: MediaItem[]) => any[];
}

/**
 * TV-Friendly Genre Loader - Renders all components immediately to preserve focus
 * Uses progressive loading within each component to avoid DOM changes that break TV focus
 */
const ProgressiveGenreLoader = memo(function ProgressiveGenreLoader({
  genres,
  contentType = "movie",
  onSelectContent,
  transformMediaItems,
}: ProgressiveGenreLoaderProps) {
  return (
    <View>
      {genres.map((genre, index) => {
        const isLastRow = index === genres.length - 1;
        // Progressive loading delay: first genre loads immediately, others with increasing delay
        const loadDelay = index * 150; // 150ms delay between each genre

        return (
          <Suspense
            key={genre.id}
            fallback={<GenreRowFallback genreName={genre.name} />}
          >
            <LazyGenreContentRow
              genre={genre}
              contentType={contentType}
              onSelectContent={onSelectContent}
              transformMediaItems={transformMediaItems}
              isLastRow={isLastRow}
              loadDelay={loadDelay}
            />
          </Suspense>
        );
      })}
    </View>
  );
});

export default ProgressiveGenreLoader;
