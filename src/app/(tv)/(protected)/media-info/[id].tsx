import { Image, ImageBackground } from "expo-image";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import React, {
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

  // Debounce refresh to prevent excessive API calls
  const lastRefreshRef = useRef<number>(0);
  const REFRESH_DEBOUNCE_MS = 5000; // Only allow refresh every 5 seconds

  // Refresh data when screen comes into focus, but debounced
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshRef.current;

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
    ]),
  );

  const handlePlayEpisode = useCallback(
    (episode: TVDeviceEpisode) => {
      router.push({
        pathname: "/watch/[id]",
        params: {
          id: params.id,
          type: params.type,
          season: selectedSeason,
          episode: episode.episodeNumber,
        },
      });
    },
    [params.id, params.type, selectedSeason, router],
  );

  const handlePlayMovie = useCallback(() => {
    router.push({
      pathname: "/watch/[id]",
      params: {
        id: params.id,
        type: params.type,
      },
    });
  }, [params.id, params.type, router]);

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
                <Image
                  source={mediaInfo.logo}
                  contentFit="contain"
                  style={{ height: 80, width: "auto" }}
                  priority="high"
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
          <ImageBackground
            source={mediaInfo.backdrop}
            style={[StyleSheet.absoluteFillObject, { opacity: 0.2 }]}
            placeholder={{
              uri: `data:image/png;base64,${mediaInfo.backdropBlurhash}`,
            }}
            placeholderContentFit="cover"
            transition={1000}
            contentFit="cover"
          />
          {/* Movie Info */}
          <View style={styles.movieColumn}>
            {/* Logo/Title */}
            <View style={styles.logoSection}>
              {mediaInfo.logo ? (
                <Image
                  source={mediaInfo.logo}
                  contentFit="contain"
                  style={{ height: 80, width: "auto" }}
                  priority="high"
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
    flexDirection: "row",
    alignItems: "center",
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
    position: "absolute",
    top: -20,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  refreshText: {
    color: "#CCCCCC",
    fontSize: 12,
    fontStyle: "italic",
  },
});
