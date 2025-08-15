import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import {
  useCallback,
  useState,
  useRef,
  useEffect,
  useTransition,
  useDeferredValue,
} from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  TVFocusGuideView,
  Animated,
} from "react-native";

import OptimizedImage from "@/src/components/common/OptimizedImage";
import EpisodeList from "@/src/components/TV/MediaInfo/EpisodeList";
import EpisodesSkeleton from "@/src/components/TV/MediaInfo/EpisodesSkeleton";
import ExpandableOverview from "@/src/components/TV/MediaInfo/ExpandableOverview";
import MediaInfoSkeleton from "@/src/components/TV/MediaInfo/MediaInfoSkeleton";
import SeasonPicker from "@/src/components/TV/MediaInfo/SeasonPicker";
import WatchProgressBar from "@/src/components/TV/MediaInfo/WatchProgressBar";
import { Colors } from "@/src/constants/Colors";
import { useTVAppState } from "@/src/context/TVAppStateContext";
import {
  useTVMediaDetails,
  useMovieDetails,
} from "@/src/data/hooks/useContent";
import { TVDeviceEpisode } from "@/src/data/types/content.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { useBackdropStore } from "@/src/stores/backdropStore";

/**
 * Small helper to format milliseconds into H:MM:SS or M:SS
 * We keep this minimal and consistent with WatchProgressBar formatting.
 */
function formatTimeFromMs(ms?: number | null): string {
  if (!ms) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function MediaInfoPage() {
  const router = useRouter();
  const { setMode } = useTVAppState();
  const params = useLocalSearchParams<{
    id: string;
    type: "movie" | "tv";
    season?: string;
  }>();

  const [selectedSeason, setSelectedSeason] = useState<number>(
    params.season ? parseInt(params.season) : 1,
  );
  const [isOverviewTruncated, setIsOverviewTruncated] =
    useState<boolean>(false);
  const overviewOpacity = useRef(new Animated.Value(1)).current;

  // Use the new Zustand-based backdrop manager
  const { show: showBackdrop } = useBackdropManager();

  // React 19 concurrent features
  const [isPending, startTransition] = useTransition();
  const deferredSelectedSeason = useDeferredValue(selectedSeason);

  // Set mode to media-info when component mounts
  useEffect(() => {
    setMode("media-info");
  }, [setMode]);

  // Conditional hook usage based on media type
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
          season: deferredSelectedSeason, // Use deferred value for better performance
        }
      : null,
  );

  // Use the appropriate data based on media type
  const mediaInfo = params.type === "movie" ? movieData.data : tvData.data;
  const isLoading =
    params.type === "movie" ? movieData.isLoading : tvData.isLoading;
  const isLoadingEpisodes =
    params.type === "movie" ? false : tvData.isLoadingEpisodes;
  const isRefreshing =
    params.type === "movie" ? movieData.isRefreshing : tvData.isRefreshing;
  const error = params.type === "movie" ? movieData.error : tvData.error;

  // Extract backdrop values to prevent unnecessary re-renders from React Query updates
  const backdropUrl = mediaInfo?.backdrop;
  const backdropBlurhash = mediaInfo?.backdropBlurhash;

  // Don't hide backdrop on unmount - let the next page handle it
  // This allows seamless transitions to the watch page
  useEffect(() => {
    return () => {
      console.log("[MediaInfo] Component unmounting, keeping backdrop visible");
    };
  }, []);

  // Debounce refresh to prevent excessive API calls
  const lastRefreshRef = useRef<number>(0);
  const REFRESH_DEBOUNCE_MS = 5000; // Only allow refresh every 5 seconds

  // Refresh data when screen comes into focus, but debounced
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshRef.current;

      // Show backdrop when page comes into focus (handles both initial load and back navigation)
      if (backdropUrl) {
        // Guard to avoid replaying the same backdrop when nothing changed.
        // Use the Zustand store's getState() so we don't cause a React re-render.
        const { url: currentUrl, visible: isVisible } =
          useBackdropStore.getState();
        if (currentUrl !== backdropUrl || !isVisible) {
          console.log(
            "[MediaInfo] Page focused - showing backdrop:",
            backdropUrl,
          );
          showBackdrop(backdropUrl, {
            fade: true,
            duration: 500,
            blurhash: backdropBlurhash,
          });
        } else {
          console.log(
            "[MediaInfo] Page focused - backdrop unchanged and visible, skipping show()",
          );
        }
      }

      // Only refresh if enough time has passed and we have data
      if (timeSinceLastRefresh >= REFRESH_DEBOUNCE_MS) {
        if (params.type === "movie" && movieData.data && movieData.refetch) {
          console.log("[MediaInfo] Refreshing movie data (debounced)");
          lastRefreshRef.current = now;
          movieData.refetch();
        } else if (params.type === "tv" && tvData.data && tvData.refetch) {
          console.log("[MediaInfo] Refreshing TV data (debounced)");
          lastRefreshRef.current = now;
          tvData.refetch();
        }
      }
    }, [
      params.type,
      movieData.data,
      movieData.refetch,
      tvData.data,
      tvData.refetch,
      backdropUrl,
      backdropBlurhash,
      showBackdrop,
    ]),
  );

  const handlePlayEpisode = useCallback(
    (episode: TVDeviceEpisode) => {
      router.push(
        {
          pathname: "/watch/[id]",
          params: {
            id: params.id,
            type: params.type,
            season: selectedSeason,
            episode: episode.episodeNumber,
            backdrop: mediaInfo?.backdrop,
            backdropBlurhash: mediaInfo?.backdropBlurhash,
          },
        },
        {
          dangerouslySingular: true,
        },
      );
    },
    [
      params.id,
      params.type,
      selectedSeason,
      router,
      mediaInfo?.backdrop,
      mediaInfo?.backdropBlurhash,
    ],
  );

  const handlePlayMovie = useCallback(() => {
    router.push(
      {
        pathname: "/watch/[id]",
        params: {
          id: params.id,
          type: params.type,
          backdrop: mediaInfo?.backdrop,
          backdropBlurhash: mediaInfo?.backdropBlurhash,
        },
      },
      {
        dangerouslySingular: true,
      },
    );
  }, [
    params.id,
    params.type,
    router,
    mediaInfo?.backdrop,
    mediaInfo?.backdropBlurhash,
  ]);

  const handleSeasonChange = useCallback(
    (newSeason: number) => {
      // Use startTransition for smooth season changes
      startTransition(() => {
        // Fade out overview before changing season
        Animated.timing(overviewOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          setSelectedSeason(newSeason);
        });
      });
    },
    [overviewOpacity, startTransition],
  );

  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleOverviewTruncationChange = useCallback((isTruncated: boolean) => {
    console.log(
      "Overview truncation changed:",
      isTruncated,
      "trapFocusUp will be:",
      !isTruncated,
    );
    setIsOverviewTruncated(isTruncated);
  }, []);

  // Fade in overview when new season data loads
  useEffect(() => {
    if (mediaInfo?.metadata?.overview && !isLoadingEpisodes) {
      Animated.timing(overviewOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [mediaInfo?.metadata?.overview, isLoadingEpisodes, overviewOpacity]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <MediaInfoSkeleton type={params.type} />
      </View>
    );
  }

  if (error || !mediaInfo) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {error || "Failed to load media information"}
          </Text>
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
      {/* Two-Column Content Section for TV Shows */}
      {params.type === "tv" && mediaInfo.navigation && mediaInfo.episodes && (
        <View style={styles.twoColumnLayout}>
          {/* Left Column - Media Info and Season Picker */}
          <View style={styles.leftColumn}>
            {/* Logo/Title */}
            <View style={styles.logoSection}>
              {mediaInfo.logo ? (
                <OptimizedImage
                  source={mediaInfo.logo}
                  contentFit="contain"
                  style={{ height: 80, width: "auto" }}
                  priority="high"
                  width={750}
                  quality={100}
                />
              ) : (
                <Text style={styles.showTitle}>{mediaInfo.title}</Text>
              )}
            </View>

            {/* Metadata Row */}
            <View style={styles.metadataRow}>
              {mediaInfo.metadata.rating ? (
                <>
                  <Text style={styles.metadataRating}>
                    ★ {mediaInfo.metadata.rating.toFixed(1)}
                  </Text>
                  <Text style={styles.metadataSeparator}>•</Text>
                </>
              ) : null}
              <Text style={styles.metadataYear}>
                {mediaInfo.airDate
                  ? new Date(mediaInfo.airDate).getFullYear()
                  : ""}
              </Text>
              <Text style={styles.metadataSeparator}>•</Text>
              <Text style={styles.metadataSeasons}>
                {mediaInfo.totalSeasons === 1
                  ? "1 Season"
                  : `${mediaInfo.totalSeasons} Seasons`}
              </Text>
              <Text style={styles.metadataSeparator}>•</Text>
              <View style={styles.ratingBox}>
                <Text style={styles.ratingBoxText}>TV-MA</Text>
              </View>
            </View>
            {mediaInfo.metadata.overview ? (
              <Animated.View
                style={[styles.overviewContainer, { opacity: overviewOpacity }]}
              >
                <ExpandableOverview
                  overview={mediaInfo.metadata.overview}
                  onTruncationChange={handleOverviewTruncationChange}
                />
              </Animated.View>
            ) : null}

            {/* Season Picker */}
            <View style={styles.seasonPickerContainer}>
              <Text style={styles.seasonPickerTitle}>Seasons</Text>
              <TVFocusGuideView
                autoFocus
                trapFocusUp={!isOverviewTruncated}
                trapFocusDown
                style={{ flex: 1 }}
              >
                <SeasonPicker
                  navigation={mediaInfo.navigation}
                  availableSeasons={mediaInfo.availableSeasons}
                  currentSeason={selectedSeason}
                  onSeasonChange={handleSeasonChange}
                />
              </TVFocusGuideView>
            </View>
          </View>

          {/* Right Column - Episodes List */}
          <View style={styles.rightColumn}>
            <View style={styles.episodesTitleContainer}>
              <Text style={styles.episodesTitle}>
                Season {selectedSeason} Episodes
              </Text>
              {isRefreshing && (
                <View style={styles.refreshIndicator}>
                  <Text style={styles.refreshText}>Updating...</Text>
                </View>
              )}
            </View>
            <TVFocusGuideView
              autoFocus
              trapFocusUp
              trapFocusDown
              style={{ flex: 1 }}
            >
              {isLoadingEpisodes ? (
                <EpisodesSkeleton />
              ) : (
                <EpisodeList
                  episodes={mediaInfo.episodes}
                  onEpisodePress={handlePlayEpisode}
                />
              )}
            </TVFocusGuideView>
          </View>
        </View>
      )}

      {/* Movie Content Section */}
      {params.type === "movie" && mediaInfo && (
        <View style={styles.movieLayout}>
          {/* Movie Info */}
          <View style={styles.movieColumn}>
            {/* Logo/Title */}
            <View style={styles.logoSection}>
              {mediaInfo.logo ? (
                <OptimizedImage
                  source={mediaInfo.logo}
                  contentFit="contain"
                  style={{ height: 80, width: "auto" }}
                  priority="high"
                  width={750}
                  quality={100}
                />
              ) : (
                <Text style={styles.showTitle}>{mediaInfo.title}</Text>
              )}
            </View>

            {/* Metadata Row */}
            <View style={styles.metadataRow}>
              {mediaInfo.metadata.rating ? (
                <>
                  <Text style={styles.metadataRating}>
                    ★ {mediaInfo.metadata.rating.toFixed(1)}
                  </Text>
                  <Text style={styles.metadataSeparator}>•</Text>
                </>
              ) : null}
              <Text style={styles.metadataYear}>
                {mediaInfo.metadata.releaseDate
                  ? new Date(mediaInfo.metadata.releaseDate).getFullYear()
                  : ""}
              </Text>
              <Text style={styles.metadataSeparator}>•</Text>
              <Text style={styles.metadataType}>Movie</Text>
              <Text style={styles.metadataSeparator}>•</Text>
              {/* If there's no significant watch history (less than 10 seconds), show duration inline */}
              {(!mediaInfo.watchHistory?.playbackTime ||
                (mediaInfo.watchHistory?.playbackTime ?? 0) < 10) &&
              mediaInfo.duration ? (
                <>
                  <Text style={styles.metadataDuration}>
                    {formatTimeFromMs(mediaInfo.duration)}
                  </Text>
                  <Text style={styles.metadataSeparator}>•</Text>
                </>
              ) : null}
              <View style={styles.ratingBox}>
                <Text style={styles.ratingBoxText}>R</Text>
              </View>
            </View>

            {/* Watch Progress Bar */}
            <View style={styles.watchProgressContainer}>
              <WatchProgressBar
                watchHistory={mediaInfo.watchHistory}
                duration={mediaInfo?.duration}
              />
              {isRefreshing && (
                <View style={styles.refreshIndicator}>
                  <Text style={styles.refreshText}>Updating...</Text>
                </View>
              )}
            </View>

            {/* Overview */}
            {mediaInfo.metadata.overview ? (
              <View style={styles.overviewContainer}>
                <ExpandableOverview
                  overview={mediaInfo.metadata.overview}
                  onTruncationChange={handleOverviewTruncationChange}
                />
              </View>
            ) : null}

            {/* Play Button */}
            <View style={styles.playButtonContainer}>
              <Pressable
                focusable
                hasTVPreferredFocus
                style={({ focused }) => [
                  styles.playButton,
                  focused && styles.playButtonFocused,
                ]}
                onPress={handlePlayMovie}
              >
                <Text style={styles.playButtonText}>▶ Play Movie</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  // Two-column layout styles
  twoColumnLayout: {
    flex: 1,
    flexDirection: "row",
    padding: 40,
  },
  leftColumn: {
    flex: 1,
    marginRight: 40,
  },
  rightColumn: {
    flex: 2,
  },

  // Left column styles
  logoSection: {
    marginBottom: 24,
  },
  showTitle: {
    color: Colors.dark.whiteText,
    fontSize: 32,
    fontWeight: "bold",
  },
  metadataRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  metadataRating: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "bold",
  },
  metadataSeparator: {
    color: "#CCCCCC",
    fontSize: 16,
    marginHorizontal: 6,
  },
  metadataYear: {
    color: "#CCCCCC",
    fontSize: 16,
  },
  metadataSeasons: {
    color: "#CCCCCC",
    fontSize: 16,
  },
  overviewContainer: {
    marginTop: 16,
  },
  ratingBox: {
    backgroundColor: "#666666",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingBoxText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  seasonPickerContainer: {
    flex: 1,
    marginTop: 8,
  },
  seasonPickerTitle: {
    color: Colors.dark.whiteText,
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
  },

  // Right column styles
  episodesTitleContainer: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  episodesTitle: {
    color: Colors.dark.whiteText,
    fontSize: 24,
    fontWeight: "bold",
  },

  // Movie layout styles
  movieLayout: {
    flex: 1,
    padding: 40,
  },
  movieColumn: {
    flex: 1,
    maxWidth: 600,
  },
  metadataType: {
    color: "#CCCCCC",
    fontSize: 16,
  },
  metadataDuration: {
    color: "#CCCCCC",
    fontSize: 16,
    marginHorizontal: 6,
  },
  playButtonContainer: {
    marginTop: 32,
  },
  playButton: {
    alignItems: "center",
    backgroundColor: Colors.dark.tint,
    borderRadius: 8,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  playButtonFocused: {
    borderColor: Colors.dark.tint,
    borderWidth: 2,
  },
  playButtonText: {
    color: Colors.dark.whiteText,
    fontSize: 18,
    fontWeight: "bold",
  },
  watchProgressContainer: {
    position: "relative",
  },
  refreshIndicator: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    position: "absolute",
    right: 0,
    top: -20,
  },
  refreshText: {
    color: "#CCCCCC",
    fontSize: 12,
    fontStyle: "italic",
  },
});
