/**
 * Code-split TV shows page content component
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

import { useShowsPageLogic } from "./hooks/useShowsPageLogic";

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

interface TVShowsPageContentProps {
  initialViewMode?: "all" | "genres";
}

const TVShowsPageContent = memo(function TVShowsPageContent({
  initialViewMode = "all",
}: TVShowsPageContentProps) {
  const {
    viewMode,
    setViewMode,
    allShowsItems,
    fetchNextShowsPage,
    hasNextShowsPage,
    isFetchingNextShowsPage,
    isLoadingAllShows,
    genresData,
    deferredGenresData,
    processedGenres,
    isLoadingGenres,
    genresError,
    handleSelectContent,
    transformMediaItems,
  } = useShowsPageLogic(initialViewMode);

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
    navigationHelper.navigateToGenre("tv", genreName);
  }, []);

  // Show loading only when the active view is still loading
  const isLoading =
    viewMode === "all" ? isLoadingAllShows : isLoadingGenres && !genresData;

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.title}>TV Shows</Text>
          <ActivityIndicator color="#FFFFFF" size="large" />
          <Text style={styles.loadingText}>Loading TV shows...</Text>
        </View>
      </View>
    );
  }

  // Genres error state (only relevant when genres view is active)
  if (viewMode === "genres" && (genresError || !genresData)) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.title}>TV Shows</Text>
          <Text style={styles.errorText}>
            {genresError?.message || "Failed to load TV show genres"}
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
            <Text style={styles.title}>TV Shows</Text>
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
              {allShowsItems.length > 0
                ? `${allShowsItems.length}+ TV shows`
                : "Browse all TV shows"}
            </Text>
          ) : (
            dataToRender && (
              <Text style={styles.subtitle}>
                Browse {dataToRender.mediaTypeCounts?.tvShows} TV shows across{" "}
                {dataToRender.totalGenres} genres
              </Text>
            )
          )}
        </View>

        {/* All Shows view */}
        {viewMode === "all" && (
          <ContentRow
            title=""
            showHeader={false}
            items={transformMediaItems(allShowsItems)}
            onSelectContent={handleSelectFromRow}
            itemSize="small"
            hasNextPage={hasNextShowsPage}
            isFetchingNextPage={isFetchingNextShowsPage}
            onLoadMore={fetchNextShowsPage}
            trapFocusDown
          />
        )}

        {/* Genres view — lightweight grid, navigates to per-genre page on select */}
        {viewMode === "genres" && (
          <TVGenreGrid
            genres={processedGenres}
            contentType="tv"
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
    paddingBottom: 0,
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

export default TVShowsPageContent;
