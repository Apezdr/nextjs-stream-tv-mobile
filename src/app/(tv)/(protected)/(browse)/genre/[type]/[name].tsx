/**
 * TV genre detail page.
 * Shows paginated content for a specific genre, navigated to from the genre grid.
 */
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  startTransition,
  useState,
} from "react";
import {
  BackHandler,
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TVFocusGuideView,
} from "react-native";

import ContentRow from "@/src/components/TV/Pages/ContentRow";
import { Colors } from "@/src/constants/Colors";
import {
  useInfiniteGenreContent,
  getFlattenedInfiniteGenreData,
} from "@/src/data/hooks/queries/useInfiniteContentQueries";
import { useRootShowData } from "@/src/data/hooks/useContent";
import { MediaItem } from "@/src/data/types/content.types";
import { navigationHelper } from "@/src/utils/navigationHelper";

function transformMediaItems(items: MediaItem[]) {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    description:
      item.type === "movie"
        ? `MOVIE • ${item.hdr || "HD"}`
        : `TV SHOW • ${item.hdr || "HD"}`,
    thumbnailUrl: item.thumbnailUrl || item.posterURL,
    thumbnailBlurhash: item.thumbnailBlurhash || item.posterBlurhash || "",
    seasonNumber: undefined,
    episodeNumber: undefined,
    mediaType: item.type as "movie" | "tv",
    link: item.link,
    backdropUrl: item.backdropUrl || item.backdrop,
    backdropBlurhash: item.backdropBlurhash,
    hdr: item.hdr,
    logo: item.logo,
  }));
}

const TVGenrePageContent = memo(function TVGenrePageContent() {
  const router = useRouter();
  const mountedAtRef = useRef(Date.now());
  const { type, name } = useLocalSearchParams<{ type: string; name: string }>();

  const mediaType = (type === "tv" ? "tv" : "movie") as "movie" | "tv";
  const genreName = Array.isArray(name) ? name[0] : (name ?? "");
  const parentBrowseRoute: Href =
    mediaType === "tv"
      ? "/(tv)/(protected)/(browse)/tv-shows"
      : "/(tv)/(protected)/(browse)/movies";

  const {
    data: genreData,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteGenreContent({
    action: "content",
    genre: genreName,
    type: mediaType,
    limit: 30,
    sort: "newest",
    sortOrder: "desc",
    includeWatchHistory: true,
    isTVdevice: true,
  });

  const items = useMemo(
    () => transformMediaItems(getFlattenedInfiniteGenreData(genreData)),
    [genreData],
  );

  // TV navigation state for shows
  const [pendingTVNavigation, setPendingTVNavigation] = useState<{
    showId: string;
    mediaType: "tv";
  } | null>(null);

  const {
    data: rootShowData,
    isLoading: isLoadingRootShow,
    error: rootShowError,
  } = useRootShowData(pendingTVNavigation?.showId ?? "", !!pendingTVNavigation);

  useEffect(() => {
    if (pendingTVNavigation && rootShowData && !isLoadingRootShow) {
      const { showId } = pendingTVNavigation;
      const firstSeason =
        rootShowData.availableSeasons.length > 0
          ? Math.min(...rootShowData.availableSeasons)
          : 1;
      navigationHelper.navigateToMediaInfo({
        id: showId,
        type: "tv",
        season: firstSeason,
        returnToGenreName: genreName,
        returnToGenreType: mediaType,
      });
      startTransition(() => setPendingTVNavigation(null));
    }
  }, [
    pendingTVNavigation,
    rootShowData,
    isLoadingRootShow,
    genreName,
    mediaType,
  ]);

  useEffect(() => {
    if (pendingTVNavigation && rootShowError && !isLoadingRootShow) {
      const { showId } = pendingTVNavigation;
      navigationHelper.navigateToMediaInfo({
        id: showId,
        type: "tv",
        season: 1,
        returnToGenreName: genreName,
        returnToGenreType: mediaType,
      });
      startTransition(() => setPendingTVNavigation(null));
    }
  }, [
    pendingTVNavigation,
    rootShowError,
    isLoadingRootShow,
    genreName,
    mediaType,
  ]);

  const handleBrowseBack = useCallback(() => {
    router.replace({
      pathname: parentBrowseRoute,
      params: { viewMode: "genres" },
    });
  }, [parentBrowseRoute, router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      // Ignore spurious back events that can fire during TV route transitions.
      if (Date.now() - mountedAtRef.current < 750) {
        return true;
      }

      handleBrowseBack();
      return true;
    });

    return () => sub.remove();
  }, [handleBrowseBack]);

  const handleSelectContent = useCallback(
    (
      showId: string,
      mediaTypeArg: "movie" | "tv",
      seasonNumber?: number,
      episodeNumber?: number,
      backdropUrl?: string,
      backdropBlurhash?: string,
    ) => {
      if (mediaTypeArg === "tv" && seasonNumber && episodeNumber) {
        navigationHelper.navigateToWatch({
          id: showId,
          type: mediaTypeArg,
          season: seasonNumber,
          episode: episodeNumber,
          ...(backdropUrl && { backdrop: backdropUrl }),
          ...(backdropBlurhash && { backdropBlurhash }),
        });
      } else if (mediaTypeArg === "tv") {
        startTransition(() =>
          setPendingTVNavigation({ showId, mediaType: "tv" }),
        );
      } else {
        navigationHelper.navigateToMediaInfo({
          id: showId,
          type: mediaTypeArg,
          ...(backdropUrl && { backdrop: backdropUrl }),
          ...(backdropBlurhash && { backdropBlurhash }),
          returnToGenreName: genreName,
          returnToGenreType: mediaType,
        });
      }
    },
    [genreName, mediaType],
  );

  const typeLabel = mediaType === "tv" ? "TV Shows" : "Movies";

  if (isLoading && items.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.title}>{genreName}</Text>
          <ActivityIndicator color="#FFFFFF" size="large" />
          <Text style={styles.loadingText}>
            Loading {genreName.toLowerCase()} {typeLabel.toLowerCase()}...
          </Text>
        </View>
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.title}>{genreName}</Text>
          <Text style={styles.errorText}>
            {(error as Error)?.message ?? "Failed to load content"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        pagingEnabled={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{genreName}</Text>
          <Text style={styles.subtitle}>{typeLabel}</Text>
        </View>

        <TVFocusGuideView trapFocusDown>
          <ContentRow
            title=""
            showHeader={false}
            items={items}
            onSelectContent={handleSelectContent}
            itemSize="small"
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={fetchNextPage}
            preferFirstItemFocus
            trapFocusDown
          />
        </TVFocusGuideView>
      </ScrollView>
    </View>
  );
});

export default TVGenrePageContent;

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.background,
    flex: 1,
  },
  errorContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingVertical: 60,
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 18,
    marginTop: 12,
    textAlign: "center",
  },
  header: {
    marginBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  loadingContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 16,
    marginTop: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  subtitle: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 18,
    marginTop: 4,
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 36,
    fontWeight: "bold",
  },
});
