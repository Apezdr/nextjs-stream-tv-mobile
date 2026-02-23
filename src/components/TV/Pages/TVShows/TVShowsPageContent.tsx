/**
 * Code-split TV shows page content component
 * Contains the heavy logic and rendering separated from the main page
 */
import { memo, lazy, Suspense } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  ActivityIndicator,
} from "react-native";

import { useShowsPageLogic } from "./hooks/useShowsPageLogic";

import { Colors } from "@/src/constants/Colors";

// Lazy load the ProgressiveGenreLoader for further code-splitting
const LazyProgressiveGenreLoader = lazy(
  () => import("@/src/components/TV/Pages/ProgressiveGenreLoader"),
);

// Fallback for the genre loader
const GenreLoaderFallback = () => (
  <View style={styles.genreLoaderFallback}>
    <ActivityIndicator color="#FFFFFF" size="large" />
    <Text style={styles.genreLoaderFallbackText}>Loading genres...</Text>
  </View>
);

const TVShowsPageContent = memo(function TVShowsPageContent() {
  const {
    genresData,
    deferredGenresData,
    processedGenres,
    isLoadingGenres,
    genresError,
    handleSelectContent,
    transformMediaItems,
  } = useShowsPageLogic();

  // Render loading state
  if (isLoadingGenres) {
    return (
      <View style={styles.container}>
        <View style={styles.contentBrowser}>
          <View style={styles.loadingContainer}>
            <Text style={styles.title}>TV Shows</Text>
            <ActivityIndicator color="#FFFFFF" size="large" />
            <Text style={styles.loadingText}>Loading TV show genres...</Text>
          </View>
        </View>
      </View>
    );
  }

  // Render error state
  if (genresError || !genresData) {
    return (
      <View style={styles.container}>
        <View style={styles.contentBrowser}>
          <View style={styles.errorContainer}>
            <Text style={styles.title}>TV Shows</Text>
            <Text style={styles.errorText}>
              {genresError?.message || "Failed to load TV show genres"}
            </Text>
            <Text style={styles.subtitle}>Please try again later</Text>
          </View>
        </View>
      </View>
    );
  }

  // Use deferred data for rendering to avoid blocking initial paint
  const dataToRender = deferredGenresData || genresData;

  return (
    <View style={styles.container}>
      {/* Content browser with stepped scrolling */}
      <ScrollView
        style={styles.contentBrowser}
        contentContainerStyle={styles.contentContainer}
        pagingEnabled={false}
      >
        {/* Page Header */}
        <View style={styles.headerContainer}>
          <Text style={styles.title}>TV Shows</Text>
          <Text style={styles.subtitle}>
            Browse {dataToRender.mediaTypeCounts.tvShows} TV shows across{" "}
            {dataToRender.totalGenres} genres
          </Text>
        </View>

        {/* Genre-based Content Rows with coordinated progressive loading */}
        <Suspense fallback={<GenreLoaderFallback />}>
          <LazyProgressiveGenreLoader
            genres={processedGenres}
            contentType="tv"
            onSelectContent={handleSelectContent}
            transformMediaItems={transformMediaItems}
          />
        </Suspense>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#141414",
    flex: 1,
  },
  contentBrowser: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 30,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  errorContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingVertical: 50,
  },
  errorText: {
    color: "#E50914",
    fontSize: 18,
    marginBottom: 10,
    textAlign: "center",
  },
  genreLoaderFallback: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  genreLoaderFallbackText: {
    color: "#CCCCCC",
    fontSize: 16,
    marginTop: 15,
  },
  headerContainer: {
    marginBottom: 30,
  },
  loadingContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingVertical: 50,
  },
  loadingText: {
    color: "#CCCCCC",
    fontSize: 16,
    marginTop: 15,
  },
  subtitle: {
    color: "#CCCCCC",
    fontSize: 18,
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 10,
  },
});

export default TVShowsPageContent;
