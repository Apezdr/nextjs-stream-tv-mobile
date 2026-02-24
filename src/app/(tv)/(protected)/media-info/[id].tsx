import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
import {
  useCallback,
  useState,
  useRef,
  useEffect,
  useTransition,
  useDeferredValue,
  useMemo,
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
import { navigationHelper } from "@/src/utils/navigationHelper";

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

/**
 * Helper to extract and format resolution information from various sources
 */
function formatResolution(dimensions?: string): string | null {
  // For movies or fallback, use the direct dimensions or hdr field
  if (dimensions) {
    return parseResolution(dimensions);
  }

  return null;
}

/**
 * Helper to format HDR information for display
 */
function formatHDR(hdr?: string | boolean): string | null {
  if (!hdr) return null;

  if (typeof hdr === "string") {
    // Clean up common HDR format strings
    if (hdr.toLowerCase().includes("hdr10+")) return "HDR10+";
    if (hdr.toLowerCase().includes("hdr10")) return "HDR10";
    if (hdr.toLowerCase().includes("dolby vision")) return "Dolby Vision";
    if (hdr.toLowerCase().includes("hdr")) return "HDR";

    // Return the string as-is if it contains useful HDR info
    if (hdr.trim().length > 0 && !hdr.toLowerCase().includes("sdr")) {
      return hdr.trim();
    }
  }

  return null;
}

/**
 * Parse resolution from dimension/hdr strings and return a user-friendly format
 */
function parseResolution(input: string): string | null {
  if (!input) return null;

  // Common resolution patterns
  const resolutionPatterns = [
    { pattern: /3840[x×]2160|4k|uhd/i, label: "4K" },
    { pattern: /2560[x×]1440|1440p/i, label: "1440p" },
    { pattern: /1920[x×]1080|1080p|fhd/i, label: "1080p" },
    { pattern: /1280[x×]720|720p|hd/i, label: "720p" },
    { pattern: /854[x×]480|480p/i, label: "480p" },
    { pattern: /640[x×]360|360p/i, label: "360p" },
  ];

  for (const { pattern, label } of resolutionPatterns) {
    if (pattern.test(input)) {
      return label;
    }
  }

  // If we can't parse a common resolution, try to extract WIDTHxHEIGHT pattern
  const dimensionMatch = input.match(/(\d{3,4})[x×](\d{3,4})/);
  if (dimensionMatch) {
    const width = parseInt(dimensionMatch[1]);
    if (width >= 3840) return "4K";
    if (width >= 2560) return "1440p";
    if (width >= 1920) return "1080p";
    if (width >= 1280) return "720p";
    if (width >= 854) return "480p";
    if (width >= 640) return "360p";
    return `${width}p`;
  }

  return null;
}

export default function MediaInfoPage() {
  const { setMode } = useTVAppState();
  const params = useLocalSearchParams<{
    id: string;
    type: "movie" | "tv";
    season?: string;
  }>();

  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(
    params.season ? parseInt(params.season) : undefined,
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

  // Derive initial season from server response when none is provided
  useEffect(() => {
    if (params.type !== "tv") return;
    if (!tvData.data) return;
    if (selectedSeason !== undefined) return;

    const availableSeasons = tvData.data.availableSeasons || [];
    const navCurrent = tvData.data.navigation?.seasons?.current;

    let derived: number | undefined;
    if (
      typeof navCurrent === "number" &&
      Array.isArray(availableSeasons) &&
      availableSeasons.includes(navCurrent)
    ) {
      derived = navCurrent;
    } else if (Array.isArray(availableSeasons) && availableSeasons.length > 0) {
      derived = Math.min(...availableSeasons);
    }

    if (derived !== undefined) {
      setSelectedSeason(derived);
    }
  }, [params.type, tvData.data, selectedSeason]);

  // Use the appropriate data based on media type
  const mediaInfo = params.type === "movie" ? movieData.data : tvData.data;
  const isLoading =
    params.type === "movie" ? movieData.isLoading : tvData.isLoading;
  const isLoadingEpisodes =
    params.type === "movie" ? false : tvData.isLoadingEpisodes;
  const isRefreshing =
    params.type === "movie" ? movieData.isRefreshing : tvData.isRefreshing;
  const error = params.type === "movie" ? movieData.error : tvData.error;

  // We no longer need these effects since the hook now handles
  // preserving show metadata across season changes

  // Compute merged display fields for TV shows
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

    // With our updated hook, we now have both overviews directly in the metadata
    const seasonOverview = mediaInfo.metadata?.overview;
    const showOverview = mediaInfo.metadata?.showOverview;

    return {
      displayGenres: mediaInfo.metadata?.genres || [],
      displayCast: (mediaInfo as any)?.cast || mediaInfo.metadata?.cast || [],
      seasonOverview: seasonOverview,
      showOverview: showOverview,
    };
  }, [params.type, mediaInfo]);

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
      navigationHelper.navigateToWatch({
        id: params.id,
        type: params.type,
        season: selectedSeason ?? mediaInfo?.seasonNumber,
        episode: episode.episodeNumber,
        backdrop: mediaInfo?.backdrop,
        backdropBlurhash: mediaInfo?.backdropBlurhash,
      });
    },
    [
      params.id,
      params.type,
      selectedSeason,
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
  }, []);

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
              {mediaInfo.metadata.vote_average != null &&
              typeof mediaInfo.metadata.vote_average === "number" &&
              mediaInfo.metadata.vote_average > 0 ? (
                <>
                  <Text style={styles.metadataRating}>
                    ★ {mediaInfo.metadata.vote_average.toFixed(1)}
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
              {mediaInfo.metadata.rating &&
                typeof mediaInfo.metadata.rating === "string" && (
                  <View style={styles.ratingBox}>
                    <Text style={styles.ratingBoxText}>
                      {mediaInfo.metadata.rating}
                    </Text>
                  </View>
                )}
            </View>
            {/* Overview Section - Simplified Logic */}
            {(() => {
              const hasSeasonOverview = !!mergedDisplayFields.seasonOverview;
              const hasShowOverview = !!mergedDisplayFields.showOverview;
              const areDifferent =
                hasSeasonOverview &&
                hasShowOverview &&
                mergedDisplayFields.seasonOverview !==
                  mergedDisplayFields.showOverview;

              return (
                <>
                  {/* Show Overview - only when both exist and are different */}
                  {areDifferent && (
                    <Animated.View
                      style={[
                        styles.overviewContainer,
                        { opacity: overviewOpacity },
                      ]}
                    >
                      <Text style={styles.overviewSectionTitle}>
                        Show Overview
                      </Text>
                      <ExpandableOverview
                        overview={mergedDisplayFields.showOverview!}
                        maxLines={1}
                        onTruncationChange={handleOverviewTruncationChange}
                        overviewType="Show Overview"
                      />
                    </Animated.View>
                  )}

                  {/* Season Overview - show when it exists and either: no show overview, or they're different */}
                  {hasSeasonOverview && (!hasShowOverview || areDifferent) && (
                    <Animated.View
                      style={[
                        styles.overviewContainer,
                        { opacity: overviewOpacity },
                      ]}
                    >
                      <Text style={styles.overviewSectionTitle}>
                        {areDifferent ? "Season Overview" : "Overview"}
                      </Text>
                      <ExpandableOverview
                        overview={mergedDisplayFields.seasonOverview!}
                        maxLines={1}
                        onTruncationChange={handleOverviewTruncationChange}
                        overviewType={
                          areDifferent ? "Season Overview" : "Overview"
                        }
                      />
                    </Animated.View>
                  )}

                  {/* Show Overview - only when season overview doesn't exist OR they're the same */}
                  {hasShowOverview && (!hasSeasonOverview || !areDifferent) && (
                    <Animated.View
                      style={[
                        styles.overviewContainer,
                        { opacity: overviewOpacity },
                      ]}
                    >
                      <Text style={styles.overviewSectionTitle}>Overview</Text>
                      <ExpandableOverview
                        overview={mergedDisplayFields.showOverview!}
                        onTruncationChange={handleOverviewTruncationChange}
                        overviewType="Overview"
                      />
                    </Animated.View>
                  )}
                </>
              );
            })()}

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
                  currentSeason={
                    selectedSeason ??
                    mediaInfo.navigation?.seasons?.current ??
                    mediaInfo.seasonNumber
                  }
                  onSeasonChange={handleSeasonChange}
                />
              </TVFocusGuideView>
            </View>
          </View>

          {/* Right Column - Episodes List */}
          <View style={styles.rightColumn}>
            <View style={styles.episodesTitleContainer}>
              <Text style={styles.episodesTitle}>
                Season {selectedSeason ?? mediaInfo.seasonNumber} Episodes
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
                  fallbackBackdrop={mediaInfo.backdrop}
                  fallbackBackdropBlurhash={mediaInfo.backdropBlurhash}
                  logo={mediaInfo.logo}
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
              {mediaInfo.metadata.vote_average != null &&
              typeof mediaInfo.metadata.vote_average === "number" &&
              mediaInfo.metadata.vote_average > 0 ? (
                <>
                  <Text style={styles.metadataRating}>
                    ★ {mediaInfo.metadata.vote_average.toFixed(1)}
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
              {(() => {
                const resolution = formatResolution(
                  (mediaInfo as any).dimensions,
                );
                const hdr = formatHDR((mediaInfo as any).hdr);
                const qualityParts = [resolution, hdr].filter(Boolean);
                const quality = qualityParts.join(" ");

                return (
                  quality && (
                    <>
                      <Text style={styles.metadataResolution}>{quality}</Text>
                      <Text style={styles.metadataSeparator}>•</Text>
                    </>
                  )
                );
              })()}
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
              {mediaInfo.metadata.rating &&
                typeof mediaInfo.metadata.rating === "string" && (
                  <View style={styles.ratingBox}>
                    <Text style={styles.ratingBoxText}>
                      {mediaInfo.metadata.rating}
                    </Text>
                  </View>
                )}
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
            {mergedDisplayFields.seasonOverview ||
            mergedDisplayFields.showOverview ? (
              <View style={styles.overviewContainer}>
                <ExpandableOverview
                  overview={
                    (mergedDisplayFields.seasonOverview ||
                      mergedDisplayFields.showOverview)!
                  }
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
  metadataResolution: {
    color: "#00D4FF", // Cyan color to make resolution stand out
    fontSize: 16,
    fontWeight: "600",
  },
  overviewContainer: {
    marginTop: 4,
  },
  overviewSectionTitle: {
    color: Colors.dark.whiteText,
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 12,
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
    marginTop: 2,
  },
  seasonPickerTitle: {
    color: Colors.dark.whiteText,
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 0,
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
