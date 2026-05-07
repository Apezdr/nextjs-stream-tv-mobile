/**
 * Code-split movies page content component
 * Contains the heavy logic and rendering separated from the main page
 */
import { memo, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  ActivityIndicator,
  TouchableOpacity as RNTouchableOpacity,
  Platform,
  TVFocusGuideView,
} from "react-native";

import { useMoviesPageLogic } from "./hooks/useMoviesPageLogic";

import ContentRow from "@/src/components/TV/Pages/ContentRow";
import TVGenreGrid from "@/src/components/TV/Pages/Genres/TVGenreGrid";
import { Colors } from "@/src/constants/Colors";
import { navigationHelper } from "@/src/utils/navigationHelper";

interface TVTouchableProps extends React.ComponentProps<
  typeof RNTouchableOpacity
> {
  isTVSelectable?: boolean;
}
const TouchableOpacity =
  RNTouchableOpacity as React.ComponentType<TVTouchableProps>;

interface MoviesPageContentProps {
  initialViewMode?: "all" | "genres";
}

const MoviesPageContent = memo(function MoviesPageContent({
  initialViewMode = "all",
}: MoviesPageContentProps) {
  const {
    viewMode,
    setViewMode,
    allMoviesItems,
    fetchNextMoviesPage,
    hasNextMoviesPage,
    isFetchingNextMoviesPage,
    isLoadingAllMovies,
    genresData,
    deferredGenresData,
    processedGenres,
    isLoadingGenres,
    genresError,
    handleSelectContent,
    transformMediaItems,
  } = useMoviesPageLogic(initialViewMode);

  const handleSelectFromRow = useCallback(
    (
      showId: string,
      mediaType: "movie" | "tv",
      seasonNumber?: number,
      episodeNumber?: number,
      backdropUrl?: string,
      backdropBlurhash?: string,
    ) => {
      handleSelectContent(
        showId,
        seasonNumber,
        episodeNumber,
        mediaType,
        backdropUrl,
        backdropBlurhash,
      );
    },
    [handleSelectContent],
  );

  const handleSelectGenre = useCallback((genreName: string) => {
    navigationHelper.navigateToGenre("movie", genreName);
  }, []);

  // Show loading only when the active view is still loading
  const isLoading =
    viewMode === "all" ? isLoadingAllMovies : isLoadingGenres && !genresData;

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.title}>Movies</Text>
          <ActivityIndicator color="#FFFFFF" size="large" />
          <Text style={styles.loadingText}>Loading movies...</Text>
        </View>
      </View>
    );
  }

  // Genres error state (only relevant when genres view is active)
  if (viewMode === "genres" && (genresError || !genresData)) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.title}>Movies</Text>
          <Text style={styles.errorText}>
            {genresError?.message || "Failed to load movie genres"}
          </Text>
          <Text style={styles.subtitle}>Please try again later</Text>
        </View>
      </View>
    );
  }

  const dataToRender = deferredGenresData || genresData;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.contentBrowser}
        contentContainerStyle={styles.contentContainer}
        pagingEnabled={false}
      >
        {/* Page Header with view mode toggle */}
        <View style={styles.headerContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Movies</Text>
            <TVFocusGuideView
              style={styles.toggleWrapper}
              autoFocus={false}
              trapFocusLeft
              trapFocusRight
            >
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  viewMode === "all" && styles.toggleButtonActive,
                ]}
                onPress={() => setViewMode("all")}
                isTVSelectable={Platform.isTV}
              >
                <Text
                  style={[
                    styles.toggleText,
                    viewMode === "all" && styles.toggleTextActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  viewMode === "genres" && styles.toggleButtonActive,
                ]}
                onPress={() => setViewMode("genres")}
                isTVSelectable={Platform.isTV}
              >
                <Text
                  style={[
                    styles.toggleText,
                    viewMode === "genres" && styles.toggleTextActive,
                  ]}
                >
                  Genres
                </Text>
              </TouchableOpacity>
            </TVFocusGuideView>
          </View>
          {viewMode === "all" ? (
            <Text style={styles.subtitle}>
              {allMoviesItems.length > 0
                ? `${allMoviesItems.length}+ movies`
                : "Browse all movies"}
            </Text>
          ) : (
            dataToRender && (
              <Text style={styles.subtitle}>
                Browse {dataToRender.mediaTypeCounts?.movies} movies across{" "}
                {dataToRender.totalGenres} genres
              </Text>
            )
          )}
        </View>

        {/* All Movies view */}
        {viewMode === "all" && (
          <ContentRow
            title=""
            showHeader={false}
            items={transformMediaItems(allMoviesItems)}
            onSelectContent={handleSelectFromRow}
            itemSize="small"
            hasNextPage={hasNextMoviesPage}
            isFetchingNextPage={isFetchingNextMoviesPage}
            onLoadMore={fetchNextMoviesPage}
            trapFocusDown
          />
        )}

        {/* Genres view — lightweight grid, navigates to per-genre page on select */}
        {viewMode === "genres" && (
          <TVGenreGrid
            genres={processedGenres}
            contentType="movie"
            onSelectGenre={handleSelectGenre}
          />
        )}
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
  headerContainer: {
    marginBottom: 30,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
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
  },
  toggleButton: {
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  toggleButtonActive: {
    backgroundColor: Colors.dark.brandPrimary,
  },
  toggleText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 18,
    fontWeight: "600",
  },
  toggleTextActive: {
    color: Colors.dark.whiteText,
  },
  toggleWrapper: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 8,
    flexDirection: "row",
    padding: 4,
  },
});

export default MoviesPageContent;
