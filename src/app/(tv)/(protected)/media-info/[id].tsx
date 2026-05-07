import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Animated,
  BackHandler,
} from "react-native";

import MediaInfoSkeleton from "@/src/components/TV/MediaInfo/MediaInfoSkeleton";
import MovieLayout from "@/src/components/TV/MediaInfo/MovieLayout";
import TVShowLayout from "@/src/components/TV/MediaInfo/TVShowLayout";
import { Colors } from "@/src/constants/Colors";
import { useTVAppState } from "@/src/context/TVAppStateContext";
import {
  useTVMediaDetails,
  useMovieDetails,
} from "@/src/data/hooks/useContent";
import {
  TVDeviceEpisode,
  TVDeviceMediaResponse,
} from "@/src/data/types/content.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { useWatchlistToggle } from "@/src/hooks/useWatchlistToggle";
import { useBackdropStore } from "@/src/stores/backdropStore";
import { navigationHelper } from "@/src/utils/navigationHelper";

export default function MediaInfoPage() {
  const { setMode } = useTVAppState();
  const params = useLocalSearchParams<{
    id: string;
    type: "movie" | "tv";
    season?: string;
    returnToGenreName?: string;
    returnToGenreType?: "movie" | "tv";
  }>();

  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(
    params.season ? parseInt(params.season) : undefined,
  );
  const overviewOpacity = useRef(new Animated.Value(1)).current;

  const { show: showBackdrop, hide: hideBackdrop } = useBackdropManager();

  useEffect(() => {
    setMode("media-info");
  }, [setMode]);

  const movieData = useMovieDetails(
    params.type === "movie"
      ? { mediaType: params.type, mediaId: params.id }
      : null,
  );

  const tvData = useTVMediaDetails(
    params.type === "tv"
      ? {
          mediaType: params.type,
          mediaId: params.id,
          season: selectedSeason,
        }
      : null,
  );

  // Active season: user's explicit choice (selectedSeason) OR the hook's auto-derived effective season
  const activeSeason = selectedSeason ?? tvData.effectiveSeason;

  const mediaInfo = params.type === "movie" ? movieData.data : tvData.data;

  const tmdbIdFromResponse =
    mediaInfo && "tmdbId" in mediaInfo
      ? ((mediaInfo as { tmdbId?: number }).tmdbId ?? null)
      : null;
  const watchlist = useWatchlistToggle({
    id: params.id,
    tmdbId: tmdbIdFromResponse,
    mediaType: params.type,
    title: mediaInfo?.title ?? "",
  });

  const isLoading =
    params.type === "movie" ? movieData.isLoading : tvData.isLoading;
  const isLoadingEpisodes =
    params.type === "movie" ? false : tvData.isLoadingEpisodes;
  const isRefreshing =
    params.type === "movie" ? movieData.isRefreshing : tvData.isRefreshing;
  const error = params.type === "movie" ? movieData.error : tvData.error;

  const mergedDisplayFields = useMemo(() => {
    if (params.type !== "tv" || !mediaInfo) {
      return {
        displayGenres: mediaInfo?.metadata?.genres || [],
        displayCast:
          (mediaInfo as any)?.cast || mediaInfo?.metadata?.cast || [],
        seasonOverview: mediaInfo?.metadata?.overview,
        showOverview: undefined,
      };
    }

    const seasonOverview = mediaInfo.metadata?.overview;
    const showOverview = mediaInfo.metadata?.showOverview;

    return {
      displayGenres: mediaInfo.metadata?.genres || [],
      displayCast: (mediaInfo as any)?.cast || mediaInfo.metadata?.cast || [],
      seasonOverview,
      showOverview,
    };
  }, [params.type, mediaInfo]);

  const tvLayoutMediaInfo = useMemo(() => {
    if (params.type !== "tv" || !mediaInfo) {
      return null;
    }

    const mediaInfoTV = mediaInfo as TVDeviceMediaResponse;

    const fallbackNavigation = {
      seasons: {
        current:
          activeSeason ??
          mediaInfoTV.seasonNumber ??
          Math.min(...(mediaInfoTV.availableSeasons || [1])),
        total:
          mediaInfoTV.totalSeasons || mediaInfoTV.availableSeasons?.length || 1,
        hasPrevious: false,
        hasNext: false,
      },
    };

    return {
      ...mediaInfoTV,
      navigation: mediaInfoTV.navigation || fallbackNavigation,
      episodes: Array.isArray(mediaInfoTV.episodes) ? mediaInfoTV.episodes : [],
    };
  }, [params.type, mediaInfo, activeSeason]);

  const backdropUrl = mediaInfo?.backdrop;
  const backdropBlurhash = mediaInfo?.backdropBlurhash;

  const { fetchStatus: fetchWatchlistStatus } = watchlist;
  useEffect(() => {
    if (mediaInfo) {
      void fetchWatchlistStatus();
    }
  }, [mediaInfo, fetchWatchlistStatus]);

  useEffect(() => {
    return () => {
      console.log("[MediaInfo] Component unmounting, hiding backdrop");
      hideBackdrop({ fade: true, duration: 300 });
    };
  }, [hideBackdrop]);

  // Keep backdrop values in refs for stable useFocusEffect access
  const isFocusedRef = useRef(true);
  const backdropUrlRef = useRef(backdropUrl);
  const backdropBlurhashRef = useRef(backdropBlurhash);
  backdropUrlRef.current = backdropUrl;
  backdropBlurhashRef.current = backdropBlurhash;

  // Show/update backdrop when URL becomes available or changes (data load)
  useEffect(() => {
    if (backdropUrl && isFocusedRef.current) {
      const { url: currentUrl, visible: isVisible } =
        useBackdropStore.getState();
      if (currentUrl !== backdropUrl || !isVisible) {
        console.log("[MediaInfo] Backdrop URL ready - showing:", backdropUrl);
        showBackdrop(backdropUrl, {
          fade: true,
          duration: 500,
          blurhash: backdropBlurhash,
        });
      }
    }
  }, [backdropUrl, backdropBlurhash, showBackdrop]);

  // Re-show backdrop on focus (handles return from screensaver or other overlays)
  // Hide backdrop on blur (handles navigation away)
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      const url = backdropUrlRef.current;
      if (url) {
        const { url: currentUrl, visible: isVisible } =
          useBackdropStore.getState();
        if (currentUrl !== url || !isVisible) {
          console.log("[MediaInfo] Page focused - restoring backdrop:", url);
          showBackdrop(url, {
            fade: true,
            duration: 500,
            blurhash: backdropBlurhashRef.current,
          });
        }
      }
      return () => {
        isFocusedRef.current = false;
        console.log("[MediaInfo] Page blurred - hiding backdrop");
        hideBackdrop({ fade: true, duration: 300 });
      };
    }, [showBackdrop, hideBackdrop]),
  );

  // --- Data refresh on focus (separate effect to avoid destabilising backdrop) ---
  const lastRefreshRef = useRef<number>(0);
  const REFRESH_DEBOUNCE_MS = 5000;
  const refetchRef = useRef<(() => void) | null>(null);

  // Keep refetch ref current without triggering focus effect re-runs
  refetchRef.current =
    params.type === "movie" && movieData.data && movieData.refetch
      ? movieData.refetch
      : params.type === "tv" && tvData.data && tvData.refetch
        ? tvData.refetch
        : null;

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastRefreshRef.current >= REFRESH_DEBOUNCE_MS) {
        if (refetchRef.current) {
          console.log("[MediaInfo] Refreshing data (debounced)");
          lastRefreshRef.current = now;
          refetchRef.current();
        }
      }
    }, []),
  );

  const handlePlayEpisode = useCallback(
    (episode: TVDeviceEpisode) => {
      navigationHelper.navigateToWatch({
        id: params.id,
        type: params.type,
        season: activeSeason ?? mediaInfo?.seasonNumber,
        episode: episode.episodeNumber,
        backdrop: mediaInfo?.backdrop,
        backdropBlurhash: mediaInfo?.backdropBlurhash,
      });
    },
    [
      params.id,
      params.type,
      activeSeason,
      mediaInfo?.seasonNumber,
      mediaInfo?.backdrop,
      mediaInfo?.backdropBlurhash,
    ],
  );

  const handlePlayMovie = useCallback(() => {
    navigationHelper.navigateToWatch({
      id: params.id,
      type: params.type,
      backdrop: mediaInfo?.backdrop,
      backdropBlurhash: mediaInfo?.backdropBlurhash,
    });
  }, [
    params.id,
    params.type,
    mediaInfo?.backdrop,
    mediaInfo?.backdropBlurhash,
  ]);

  const handleSeasonChange = useCallback(
    (newSeason: number) => {
      Animated.timing(overviewOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();

      setSelectedSeason(newSeason);
    },
    [overviewOpacity],
  );

  const handleGoBack = useCallback(() => {
    if (params.returnToGenreName && params.returnToGenreType) {
      router.replace({
        pathname: "/(tv)/(protected)/(browse)/genre/[type]/[name]",
        params: {
          type: params.returnToGenreType,
          name: params.returnToGenreName,
        },
      });
      return;
    }

    router.back();
  }, [params.returnToGenreName, params.returnToGenreType]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleGoBack();
      return true;
    });

    return () => sub.remove();
  }, [handleGoBack]);

  const handleWatchlistFocus = useCallback(() => {}, []);
  const handleWatchlistBlur = useCallback(() => {}, []);

  const handleOverviewTruncationChange = useCallback(
    (_isTruncated: boolean) => {},
    [],
  );

  useEffect(() => {
    if (
      (mergedDisplayFields.seasonOverview ||
        mergedDisplayFields.showOverview) &&
      !isLoadingEpisodes
    ) {
      Animated.timing(overviewOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [
    mergedDisplayFields.seasonOverview,
    mergedDisplayFields.showOverview,
    isLoadingEpisodes,
    overviewOpacity,
  ]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <MediaInfoSkeleton type={params.type} />
      </View>
    );
  }

  if (error || !mediaInfo) {
    const errorMessage = error || "Failed to load media information";

    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable
            focusable
            hasTVPreferredFocus
            style={({ focused }) => [
              styles.backButton,
              focused && styles.backButtonFocused,
            ]}
            onPress={handleGoBack}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {params.type === "tv" && tvLayoutMediaInfo && (
        <TVShowLayout
          mediaInfo={tvLayoutMediaInfo}
          watchlist={watchlist}
          selectedSeason={activeSeason}
          isLoadingEpisodes={isLoadingEpisodes}
          isRefreshing={isRefreshing}
          overviewOpacity={overviewOpacity}
          mergedDisplayFields={mergedDisplayFields}
          trailerUrl={tvLayoutMediaInfo.metadata.trailer_url}
          onSeasonChange={handleSeasonChange}
          onEpisodePlay={handlePlayEpisode}
          onWatchlistFocus={handleWatchlistFocus}
          onWatchlistBlur={handleWatchlistBlur}
          onOverviewTruncationChange={handleOverviewTruncationChange}
        />
      )}

      {params.type === "movie" && (
        <MovieLayout
          mediaInfo={mediaInfo}
          watchlist={watchlist}
          isRefreshing={isRefreshing}
          mergedDisplayFields={mergedDisplayFields}
          onPlay={handlePlayMovie}
          onWatchlistFocus={handleWatchlistFocus}
          onWatchlistBlur={handleWatchlistBlur}
          onOverviewTruncationChange={handleOverviewTruncationChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backButtonFocused: {
    backgroundColor: Colors.dark.tint,
    borderColor: "#FFFFFF",
    borderWidth: 2,
  },
  backButtonText: {
    color: Colors.dark.whiteText,
    fontSize: 16,
  },
  container: {
    backgroundColor: Colors.dark.background,
    flex: 1,
  },
  errorContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  errorText: {
    color: "#E50914",
    fontSize: 18,
    marginBottom: 20,
    textAlign: "center",
  },
});
