import { memo, lazy, Suspense } from "react";
import { View, StyleSheet, Text, ActivityIndicator } from "react-native";

import { useGenreContentData } from "./hooks";

import { Colors } from "@/src/constants/Colors";
import { MediaItem } from "@/src/data/types/content.types";

// Lazy load ContentRow for better code-splitting
const LazyContentRow = lazy(
  () => import("@/src/components/TV/Pages/ContentRow"),
);

// Fallback for ContentRow loading
const ContentRowFallback = () => (
  <View style={styles.contentRowFallback}>
    <ActivityIndicator color="#FFFFFF" size="small" />
    <Text style={styles.contentRowFallbackText}>Loading content...</Text>
  </View>
);

// Component for individual genre content rows
interface GenreContentRowProps {
  genre: { id: number; name: string; movieCount?: number };
  onSelectContent: (
    showId: string,
    seasonNumber: number | undefined,
    episodeNumber: number | undefined,
    mediaType: "movie" | "tv",
  ) => void;
  transformMediaItems: (items: MediaItem[]) => any[];
  isLastRow?: boolean;
  loadDelay?: number; // Delay for progressive loading
}

const GenreContentRow = memo(function GenreContentRow({
  genre,
  onSelectContent,
  transformMediaItems,
  isLastRow = false,
  loadDelay = 0,
}: GenreContentRowProps) {
  const {
    transformedGenreContent,
    isLoadingGenreContent,
    genreContentError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    shouldLoad,
  } = useGenreContentData({ genre, transformMediaItems, loadDelay });

  // Show loading state if not yet ready to load or actively loading
  if (!shouldLoad || isLoadingGenreContent) {
    return (
      <View style={styles.genreSection}>
        <Text style={styles.genreTitle}>{genre.name}</Text>
        <View style={styles.genreLoadingContainer}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={styles.genreLoadingText}>
            {!shouldLoad
              ? `Preparing ${genre.name.toLowerCase()}...`
              : `Loading ${genre.name.toLowerCase()}...`}
          </Text>
        </View>
      </View>
    );
  }

  // Error state for this genre
  if (genreContentError) {
    return (
      <View style={styles.genreSection}>
        <Text style={styles.genreTitle}>{genre.name}</Text>
        <View style={styles.genreErrorContainer}>
          <Text style={styles.genreErrorText}>
            {genreContentError.message ||
              `Failed to load ${genre.name.toLowerCase()}`}
          </Text>
        </View>
      </View>
    );
  }

  // Don't render if no content
  if (transformedGenreContent.length === 0) {
    return null;
  }

  return (
    <View style={styles.genreSection}>
      <Suspense fallback={<ContentRowFallback />}>
        <LazyContentRow
          title={`${genre.name} Movies`}
          items={transformedGenreContent}
          onSelectContent={onSelectContent}
          itemSize="medium"
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={fetchNextPage}
          loadMoreThreshold={0.6} // More aggressive loading for TV navigation
          trapFocusDown={isLastRow}
        />
      </Suspense>
    </View>
  );
});

const styles = StyleSheet.create({
  contentRowFallback: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 40,
  },
  contentRowFallbackText: {
    color: "#CCCCCC",
    fontSize: 14,
    marginLeft: 10,
  },
  genreErrorContainer: {
    paddingVertical: 20,
  },
  genreErrorText: {
    color: "#E50914",
    fontSize: 14,
  },
  genreLoadingContainer: {
    alignItems: "center",
    flexDirection: "row",
    paddingVertical: 20,
  },
  genreLoadingText: {
    color: "#CCCCCC",
    fontSize: 14,
    marginLeft: 10,
  },
  genreSection: {
    marginBottom: 20,
    minHeight: 280,
    paddingVertical: 10,
  },
  genreTitle: {
    color: Colors.dark.whiteText,
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 15,
  },
});

export default GenreContentRow;
