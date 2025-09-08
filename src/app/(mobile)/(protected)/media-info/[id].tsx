import { Ionicons } from "@expo/vector-icons";
import { ImageBackground } from "expo-image";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useCallback, useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import OptimizedImage from "@/src/components/common/OptimizedImage";
import MobileActionSheet, {
  ActionSheetAction,
} from "@/src/components/Mobile/ActionSheet/MobileActionSheet";
import { Colors } from "@/src/constants/Colors";
import {
  useTVMediaDetails,
  useMovieDetails,
} from "@/src/data/hooks/useContent";
import { TVDeviceEpisode } from "@/src/data/types/content.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { useBackdropStore } from "@/src/stores/backdropStore";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

/**
 * Format duration from milliseconds to readable time
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

export default function MobileMediaInfoPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    type: "movie" | "tv";
    season?: string;
  }>();

  const [selectedSeason, setSelectedSeason] = useState<number>(
    params.season ? parseInt(params.season) : 1,
  );

  // Action sheet state for episodes
  const [selectedEpisode, setSelectedEpisode] =
    useState<TVDeviceEpisode | null>(null);
  const [showEpisodeActionSheet, setShowEpisodeActionSheet] = useState(false);

  // Use the backdrop manager
  const { show: showBackdrop } = useBackdropManager();
  const insets = useSafeAreaInsets();

  // Debounce refresh to prevent excessive API calls
  const lastRefreshRef = useRef<number>(0);
  const REFRESH_DEBOUNCE_MS = 5000;

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
          season: selectedSeason,
        }
      : null,
  );

  // Use the appropriate data based on media type
  const mediaInfo = params.type === "movie" ? movieData.data : tvData.data;
  const isLoading =
    params.type === "movie" ? movieData.isLoading : tvData.isLoading;
  const isLoadingEpisodes =
    params.type === "movie" ? false : tvData.isLoadingEpisodes;
  const error = params.type === "movie" ? movieData.error : tvData.error;

  // Extract backdrop values - fallback to poster for TV shows if no backdrop
  const backdropUrl =
    mediaInfo?.backdrop ||
    (params.type === "tv" ? mediaInfo?.posterURL : undefined);
  const backdropBlurhash =
    mediaInfo?.backdropBlurhash ||
    (params.type === "tv" ? mediaInfo?.posterBlurhash : undefined);

  // Show backdrop when page comes into focus
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshRef.current;

      // Show backdrop when page comes into focus
      if (backdropUrl) {
        const { url: currentUrl, visible: isVisible } =
          useBackdropStore.getState();
        if (currentUrl !== backdropUrl || !isVisible) {
          console.log("[MobileMediaInfo] Showing backdrop:", backdropUrl);
          showBackdrop(backdropUrl, {
            fade: true,
            duration: 500,
            blurhash: backdropBlurhash,
          });
        }
      }

      // Debounced refresh
      if (timeSinceLastRefresh >= REFRESH_DEBOUNCE_MS) {
        if (params.type === "movie" && movieData.data && movieData.refetch) {
          lastRefreshRef.current = now;
          movieData.refetch();
        } else if (params.type === "tv" && tvData.data && tvData.refetch) {
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

  // Handle episode action sheet
  const handleEpisodePress = useCallback((episode: TVDeviceEpisode) => {
    setSelectedEpisode(episode);
    setShowEpisodeActionSheet(true);
  }, []);

  const handleCloseEpisodeActionSheet = useCallback(() => {
    setShowEpisodeActionSheet(false);
    setSelectedEpisode(null);
  }, []);

  // Handle episode play action
  const handlePlayEpisode = useCallback(
    (episode: TVDeviceEpisode) => {
      // Show backdrop immediately for smooth transition
      if (mediaInfo?.backdrop) {
        showBackdrop(mediaInfo.backdrop, {
          fade: true,
          duration: 300,
          blurhash: mediaInfo.backdropBlurhash,
        });
      }

      router.push(
        {
          pathname: "/(mobile)/(protected)/watch/[id]",
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
      showBackdrop,
    ],
  );

  // Handle episode info action
  const handleEpisodeInfo = useCallback(
    (episode: TVDeviceEpisode) => {
      // Show backdrop immediately for smooth transition
      if (mediaInfo?.backdrop) {
        showBackdrop(mediaInfo.backdrop, {
          fade: true,
          duration: 300,
          blurhash: mediaInfo.backdropBlurhash,
        });
      }

      router.push(
        {
          pathname:
            "/(mobile)/(protected)/episode-info/[showId]/[season]/[episode]",
          params: {
            showId: params.id,
            season: selectedSeason.toString(),
            episode: episode.episodeNumber.toString(),
          },
        },
        {
          dangerouslySingular: true,
        },
      );
    },
    [
      params.id,
      selectedSeason,
      router,
      mediaInfo?.backdrop,
      mediaInfo?.backdropBlurhash,
      showBackdrop,
    ],
  );

  // Handle movie play
  const handlePlayMovie = useCallback(() => {
    router.push(
      {
        pathname: "/(mobile)/(protected)/watch/[id]",
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

  // Handle season change
  const handleSeasonChange = useCallback((newSeason: number) => {
    setSelectedSeason(newSeason);
  }, []);

  // Handle go back
  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  // Create action sheet actions for selected episode
  const episodeActions: ActionSheetAction[] = selectedEpisode
    ? [
        {
          id: "play",
          title: "Play Episode",
          icon: "play",
          variant: "primary",
          onPress: () => {
            handleCloseEpisodeActionSheet();
            handlePlayEpisode(selectedEpisode);
          },
        },
        {
          id: "info",
          title: "Episode Info",
          icon: "information-circle",
          variant: "default",
          onPress: () => {
            handleCloseEpisodeActionSheet();
            handleEpisodeInfo(selectedEpisode);
          },
        },
      ]
    : [];

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.dark.brandPrimary} size="large" />
          <Text style={styles.loadingText}>Loading media info...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error || !mediaInfo) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {error || "Failed to load media information"}
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackButton}
          onPress={handleGoBack}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.dark.whiteText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {mediaInfo.title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero section with backdrop */}
        <View style={styles.heroSection}>
          <ImageBackground
            source={{ uri: backdropUrl }}
            placeholder={{
              uri: `data:image/png;base64,${backdropBlurhash}`,
            }}
            style={styles.heroBackground}
            contentFit="cover"
            placeholderContentFit="cover"
          >
            {/* Multi-layer gradient overlay for enhanced visual depth */}
            <View style={styles.gradientOverlay} />
            <View style={styles.bottomGradient} />

            <View style={styles.heroContentContainer}>
              <View style={styles.heroContent}>
                {/* TV show with backdrop: poster + logo layout */}
                {params.type === "tv" &&
                mediaInfo.backdrop &&
                mediaInfo.posterURL ? (
                  <View style={styles.tvHeroLayout}>
                    {/* Poster image */}
                    <View style={styles.posterContainer}>
                      <OptimizedImage
                        source={{ uri: mediaInfo.posterURL }}
                        placeholder={{
                          uri: `data:image/png;base64,${mediaInfo.posterBlurhash}`,
                        }}
                        style={styles.posterImage}
                        contentFit="cover"
                        placeholderContentFit="cover"
                        priority="high"
                        width={150}
                        quality={90}
                      />
                    </View>

                    {/* Logo or title beside poster */}
                    <View style={styles.tvHeroTextContent}>
                      {mediaInfo.logo ? (
                        <View style={styles.tvLogoContainer}>
                          <OptimizedImage
                            source={mediaInfo.logo}
                            contentFit="contain"
                            style={styles.tvLogoImage}
                            priority="high"
                            width={200}
                            quality={100}
                          />
                        </View>
                      ) : (
                        <Text style={styles.tvHeroTitle} numberOfLines={3}>
                          {mediaInfo.title}
                        </Text>
                      )}
                    </View>
                  </View>
                ) : (
                  /* Standard layout for movies or TV without backdrop/poster */
                  <>
                    {/* Logo or title */}
                    {mediaInfo.logo ? (
                      <View style={styles.logoContainer}>
                        <OptimizedImage
                          source={mediaInfo.logo}
                          contentFit="contain"
                          style={styles.logoImage}
                          priority="high"
                          width={300}
                          quality={100}
                        />
                      </View>
                    ) : (
                      <Text style={styles.heroTitle} numberOfLines={2}>
                        {mediaInfo.title}
                      </Text>
                    )}

                    {/* Show metadata and play button only for movies */}
                    {params.type === "movie" && (
                      <>
                        {/* Quick metadata in hero */}
                        <View style={styles.heroMetadata}>
                          {mediaInfo.metadata.rating && (
                            <View style={styles.heroRatingContainer}>
                              <Text style={styles.heroRatingText}>
                                ⭐ {mediaInfo.metadata.rating.toFixed(1)}
                              </Text>
                            </View>
                          )}

                          <Text style={styles.heroMetadataText}>
                            {mediaInfo.metadata.releaseDate
                              ? new Date(
                                  mediaInfo.metadata.releaseDate,
                                ).getFullYear()
                              : ""}
                          </Text>

                          {mediaInfo.duration && (
                            <Text style={styles.heroMetadataText}>
                              {formatTimeFromMs(mediaInfo.duration)}
                            </Text>
                          )}

                          <View style={styles.heroRatingBadge}>
                            <Text style={styles.heroRatingBadgeText}>R</Text>
                          </View>
                        </View>

                        {/* Play button only for movies */}
                        <TouchableOpacity
                          style={styles.playButton}
                          onPress={handlePlayMovie}
                        >
                          <Ionicons
                            name="play"
                            size={20}
                            color={Colors.dark.whiteText}
                          />
                          <Text style={styles.playButtonText}>Play Movie</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </>
                )}
              </View>
            </View>
          </ImageBackground>
        </View>

        {/* Info section */}
        <View style={styles.infoSection}>
          {/* Metadata - show for all content, but don't duplicate for movies */}
          {params.type === "tv" && (
            <View style={styles.metadataContainer}>
              {mediaInfo.metadata.rating && (
                <View style={styles.ratingContainer}>
                  <Text style={styles.ratingText}>
                    ⭐ {mediaInfo.metadata.rating.toFixed(1)}
                  </Text>
                </View>
              )}

              <Text style={styles.metadataText}>
                {mediaInfo.airDate
                  ? new Date(mediaInfo.airDate).getFullYear()
                  : ""}
              </Text>

              <Text style={styles.metadataText}>
                {mediaInfo.totalSeasons === 1
                  ? "1 Season"
                  : `${mediaInfo.totalSeasons} Seasons`}
              </Text>

              <View style={styles.ratingBadge}>
                <Text style={styles.ratingBadgeText}>TV-MA</Text>
              </View>
            </View>
          )}

          {/* Genres */}
          {mediaInfo.metadata.genres &&
            mediaInfo.metadata.genres.length > 0 && (
              <View style={styles.genresContainer}>
                {mediaInfo.metadata.genres.slice(0, 4).map((genre: any) => (
                  <View key={genre.id} style={styles.genreChip}>
                    <Text style={styles.genreText}>{genre.name}</Text>
                  </View>
                ))}
              </View>
            )}

          {/* Overview */}
          {mediaInfo.metadata.overview && (
            <View style={styles.overviewContainer}>
              <Text style={styles.overviewTitle}>Overview</Text>
              <Text style={styles.overviewText}>
                {mediaInfo.metadata.overview}
              </Text>
            </View>
          )}

          {/* TV Show specific: Season picker and episodes */}
          {params.type === "tv" &&
            mediaInfo.navigation &&
            mediaInfo.episodes && (
              <>
                {/* Season picker */}
                <View style={styles.seasonSection}>
                  <Text style={styles.sectionTitle}>Seasons</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.seasonsList}
                  >
                    {mediaInfo.availableSeasons.map((season) => (
                      <TouchableOpacity
                        key={season}
                        style={[
                          styles.seasonButton,
                          season === selectedSeason &&
                            styles.seasonButtonActive,
                        ]}
                        onPress={() => handleSeasonChange(season)}
                      >
                        <Text
                          style={[
                            styles.seasonButtonText,
                            season === selectedSeason &&
                              styles.seasonButtonTextActive,
                          ]}
                        >
                          Season {season}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Episodes list */}
                <View style={styles.episodesSection}>
                  <Text style={styles.sectionTitle}>
                    Season {selectedSeason} Episodes
                  </Text>

                  {isLoadingEpisodes ? (
                    <View style={styles.episodesLoading}>
                      <ActivityIndicator color={Colors.dark.brandPrimary} />
                      <Text style={styles.loadingText}>
                        Loading episodes...
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.episodesList}>
                      {mediaInfo.episodes.map((episode) => (
                        <TouchableOpacity
                          key={episode.episodeNumber}
                          style={styles.episodeCard}
                          onPress={() => handleEpisodePress(episode)}
                        >
                          <View style={styles.episodeImageContainer}>
                            <OptimizedImage
                              source={episode.thumbnail}
                              placeholder={{
                                uri: `data:image/png;base64,${episode.thumbnailBlurhash}`,
                              }}
                              style={styles.episodeImage}
                              contentFit="cover"
                              placeholderContentFit="cover"
                              width={440}
                              quality={85}
                            />
                            <View style={styles.episodePlayOverlay}>
                              <Ionicons
                                name="play-circle"
                                size={32}
                                color="rgba(255, 255, 255, 0.9)"
                              />
                            </View>

                            {/* Watch progress if available */}
                            {episode.watchHistory &&
                              episode.watchHistory.playbackTime > 0 && (
                                <View style={styles.episodeProgressContainer}>
                                  <View
                                    style={[
                                      styles.episodeProgressBar,
                                      {
                                        width: `${
                                          (episode.watchHistory.playbackTime /
                                            (episode.duration * 1000)) *
                                          100
                                        }%`,
                                      },
                                    ]}
                                  />
                                </View>
                              )}
                          </View>

                          <View style={styles.episodeInfo}>
                            <View style={styles.episodeHeader}>
                              <Text style={styles.episodeNumber}>
                                Episode {episode.episodeNumber}
                              </Text>
                              <Text style={styles.episodeDuration}>
                                {formatTimeFromMs(episode.duration)}
                              </Text>
                            </View>
                            <Text style={styles.episodeTitle} numberOfLines={2}>
                              {episode.title}
                            </Text>
                            {episode.description && (
                              <Text
                                style={styles.episodeDescription}
                                numberOfLines={3}
                              >
                                {episode.description}
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </>
            )}
        </View>
      </ScrollView>

      {/* Episode Action Sheet */}
      <MobileActionSheet
        visible={showEpisodeActionSheet}
        onClose={handleCloseEpisodeActionSheet}
        title={
          selectedEpisode
            ? `Episode ${selectedEpisode.episodeNumber}`
            : undefined
        }
        subtitle={selectedEpisode?.title}
        actions={episodeActions}
        backdropDismiss={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.background,
    flex: 1,
  },

  // Header styles
  header: {
    alignItems: "center",
    borderBottomColor: Colors.dark.outline,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBackButton: {
    marginRight: 8,
    padding: 8,
  },
  headerTitle: {
    color: Colors.dark.whiteText,
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
  },
  headerSpacer: {
    width: 40, // Balance the back button
  },

  // Content styles
  content: {
    flex: 1,
  },

  // Hero section styles
  heroSection: {
    height: screenHeight * 0.4,
    minHeight: 250,
  },
  heroBackground: {
    flex: 1,
    justifyContent: "flex-end",
  },
  gradientOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  bottomGradient: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    bottom: 0,
    height: "100%",
    left: 0,
    position: "absolute",
    right: 0,
  },
  heroContentContainer: {
    flex: 1,
    justifyContent: "flex-end",
    position: "relative",
    zIndex: 1,
  },
  heroContent: {
    padding: 20,
    paddingBottom: 40,
  },
  heroMetadata: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  heroRatingContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  heroRatingText: {
    color: Colors.dark.whiteText,
    fontSize: 12,
    fontWeight: "600",
  },
  heroMetadataText: {
    color: Colors.dark.whiteText,
    fontSize: 14,
    fontWeight: "500",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  heroRatingBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  heroRatingBadgeText: {
    color: Colors.dark.whiteText,
    fontSize: 12,
    fontWeight: "600",
  },
  logoContainer: {
    height: 60,
    marginBottom: 20,
    width: 200,
  },
  logoImage: {
    height: "100%",
    width: "100%",
  },
  heroTitle: {
    color: Colors.dark.whiteText,
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 20,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  playButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: Colors.dark.brandPrimary,
    borderRadius: 8,
    elevation: 4,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  playButtonText: {
    color: Colors.dark.whiteText,
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },

  // TV show hero styles
  tvHeroLayout: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 20,
  },
  posterContainer: {
    borderRadius: 12,
    elevation: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  posterImage: {
    height: 225, // 3:2 aspect ratio for poster
    width: 150,
  },
  tvHeroTextContent: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 10,
  },
  tvLogoContainer: {
    height: 80,
    marginBottom: 16,
    width: "100%",
  },
  tvLogoImage: {
    height: "100%",
    width: "100%",
  },
  tvHeroTitle: {
    color: Colors.dark.whiteText,
    fontSize: 28,
    fontWeight: "bold",
    lineHeight: 34,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },

  // Info section styles
  infoSection: {
    padding: 20,
  },
  metadataContainer: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  ratingContainer: {
    backgroundColor: Colors.dark.brandPrimary,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingText: {
    color: Colors.dark.whiteText,
    fontSize: 12,
    fontWeight: "600",
  },
  metadataText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    fontWeight: "500",
  },
  ratingBadge: {
    backgroundColor: Colors.dark.outline,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingBadgeText: {
    color: Colors.dark.whiteText,
    fontSize: 12,
    fontWeight: "600",
  },

  // Genres styles
  genresContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  genreChip: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  genreText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 12,
    fontWeight: "500",
  },

  // Overview styles
  overviewContainer: {
    marginBottom: 24,
  },
  overviewTitle: {
    color: Colors.dark.whiteText,
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
  },
  overviewText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    lineHeight: 20,
  },

  // Season section styles
  seasonSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: Colors.dark.whiteText,
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
  },
  seasonsList: {
    gap: 12,
    paddingHorizontal: 4,
  },
  seasonButton: {
    backgroundColor: Colors.dark.cardBackground,
    borderColor: "transparent",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  seasonButtonActive: {
    backgroundColor: Colors.dark.brandPrimary,
    borderColor: Colors.dark.brandPrimary,
  },
  seasonButtonText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    fontWeight: "600",
  },
  seasonButtonTextActive: {
    color: Colors.dark.whiteText,
  },

  // Episodes section styles
  episodesSection: {
    marginBottom: 20,
  },
  episodesLoading: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 40,
  },
  episodesList: {
    gap: 16,
  },
  episodeCard: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 8,
    elevation: 3,
    flexDirection: "column",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  episodeImageContainer: {
    height: 190,
    position: "relative",
    width: "100%",
  },
  episodeImage: {
    height: "100%",
    width: "100%",
  },
  episodePlayOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  episodeProgressContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    bottom: 0,
    height: 3,
    left: 0,
    position: "absolute",
    right: 0,
  },
  episodeProgressBar: {
    backgroundColor: Colors.dark.brandPrimary,
    height: "100%",
  },
  episodeInfo: {
    flex: 1,
    justifyContent: "space-between",
    padding: 12,
  },
  episodeHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  episodeNumber: {
    color: Colors.dark.brandPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
  episodeDuration: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 12,
  },
  episodeTitle: {
    color: Colors.dark.whiteText,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  episodeDescription: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 13,
    lineHeight: 18,
  },

  // Loading and error states
  loadingContainer: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
  },
  loadingText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 16,
  },
  errorContainer: {
    alignItems: "center",
    flex: 1,
    gap: 20,
    justifyContent: "center",
    padding: 20,
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 18,
    textAlign: "center",
  },
  backButton: {
    backgroundColor: Colors.dark.brandPrimary,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backButtonText: {
    color: Colors.dark.whiteText,
    fontSize: 16,
    fontWeight: "600",
  },
});
