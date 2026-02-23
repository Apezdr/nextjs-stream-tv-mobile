import { Ionicons } from "@expo/vector-icons";
import { ImageBackground } from "expo-image";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import OptimizedImage from "@/src/components/common/OptimizedImage";
import { Colors } from "@/src/constants/Colors";
import { useShowEpisode } from "@/src/data/hooks/useContent";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { useDimensions } from "@/src/hooks/useDimensions";
import { useBackdropStore } from "@/src/stores/backdropStore";
import { navigationHelper } from "@/src/utils/navigationHelper";

/**
 * Format duration from seconds to readable time
 */
function formatTimeFromSeconds(seconds?: number | null): string {
  if (!seconds) return "0:00";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export default function EpisodeInfoPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    showId: string;
    season: string;
    episode: string;
  }>();

  // Get dynamic dimensions
  const { window } = useDimensions();
  const { width: screenWidth, height: screenHeight } = window;

  const seasonNumber = parseInt(params.season, 10);
  const episodeNumber = parseInt(params.episode, 10);

  // Use the backdrop manager
  const { show: showBackdrop } = useBackdropManager();
  const insets = useSafeAreaInsets();

  // Debounce refresh to prevent excessive API calls
  const lastRefreshRef = useRef<number>(0);
  const REFRESH_DEBOUNCE_MS = 5000;

  // Fetch episode-specific data using our dedicated hook
  const episodeData = useShowEpisode({
    showId: params.showId,
    season: seasonNumber,
    episode: episodeNumber,
  });

  // The data is already in the correct format, no type casting needed
  const episode = episodeData.data;

  // Show backdrop when page comes into focus
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshRef.current;

      // Use episode thumbnail as backdrop, or fallback to show backdrop
      const backdropUrl = episode?.episode?.thumbnail || episode?.backdrop;
      const backdropBlurhash =
        episode?.episode?.thumbnailBlurhash || episode?.backdropBlurhash;

      // Show backdrop when page comes into focus
      if (backdropUrl) {
        const { url: currentUrl, visible: isVisible } =
          useBackdropStore.getState();
        if (currentUrl !== backdropUrl || !isVisible) {
          console.log("[EpisodeInfo] Showing backdrop:", backdropUrl);
          showBackdrop(backdropUrl, {
            fade: true,
            duration: 500,
            blurhash: backdropBlurhash,
          });
        }
      }

      // Debounced refresh
      if (
        timeSinceLastRefresh >= REFRESH_DEBOUNCE_MS &&
        episodeData &&
        episodeData.refetch
      ) {
        lastRefreshRef.current = now;
        episodeData.refetch();
      }
    }, [
      episodeData.refetch,
      episode?.episode?.thumbnail,
      episode?.episode?.thumbnailBlurhash,
      showBackdrop,
    ]),
  );

  // Handle play episode
  const handlePlayEpisode = useCallback(() => {
    if (!episode) return;

    navigationHelper.navigateToWatch({
      id: params.showId,
      type: "tv",
      season: seasonNumber,
      episode: episodeNumber,
      backdrop: episode?.episode?.thumbnail,
      backdropBlurhash: episode?.episode?.thumbnailBlurhash,
    });
  }, [
    episode,
    params.showId,
    seasonNumber,
    episodeNumber,
    router,
    episode?.backdrop,
    episode?.backdropBlurhash,
  ]);

  // Handle go to show info
  const handleGoToShow = useCallback(() => {
    navigationHelper.navigateToMediaInfo(
      {
        id: params.showId,
        type: "tv",
        season: seasonNumber,
      },
      true,
    ); // fromEpisodeInfo = true to use dismissTo
  }, [router, params.showId, seasonNumber]);

  // Handle go back
  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  // Loading state
  if (episodeData.isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.dark.brandPrimary} size="large" />
          <Text style={styles.loadingText}>Loading episode...</Text>
        </View>
      </View>
    );
  }

  // Error state or episode not found
  if (episodeData.error || !episodeData.data || !episode) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {episodeData.error || "Episode not found"}
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const showData = episode;
  const watchProgress = (episode?.watchHistory?.playbackTime || 0) * 1000;
  const totalDuration = episode?.duration || 0;
  const progressPercentage =
    totalDuration > 0 ? watchProgress / totalDuration : 0;

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
          {showData.title}
        </Text>
        <TouchableOpacity
          style={styles.headerInfoButton}
          onPress={handleGoToShow}
        >
          <Ionicons
            name="information-circle"
            size={24}
            color={Colors.dark.brandPrimary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero section with episode thumbnail */}
        <View style={[styles.heroSection, { height: screenHeight * 0.4 }]}>
          <ImageBackground
            source={{
              uri:
                episode?.episode?.thumbnail &&
                episode.episode.thumbnail.trim() !== ""
                  ? episode.episode.thumbnail
                  : (episode?.backdrop ?? ""),
            }}
            placeholder={
              episode?.episode?.thumbnailBlurhash || episode?.backdropBlurhash
                ? {
                    uri: `data:image/png;base64,${
                      episode?.episode?.thumbnailBlurhash ||
                      episode?.backdropBlurhash
                    }`,
                  }
                : undefined
            }
            style={styles.heroBackground}
            contentFit="cover"
            placeholderContentFit="cover"
          >
            {/* Gradient overlay */}
            <View style={styles.gradientOverlay} />

            <View style={styles.heroContentContainer}>
              <View style={styles.heroContent}>
                {/* Episode info */}
                <View style={styles.episodeMetadata}>
                  <Text style={styles.episodeNumber}>
                    S{seasonNumber}E{episodeNumber}
                  </Text>
                  {episode?.hdr && (
                    <View style={styles.hdrBadge}>
                      <Text style={styles.hdrText}>{episode.hdr}</Text>
                    </View>
                  )}
                </View>

                {/* Episode title or logo fallback */}
                {episode?.episode?.title ? (
                  <Text style={styles.episodeTitle} numberOfLines={2}>
                    {episode.episode.title}
                  </Text>
                ) : episode?.logo ? (
                  <View style={styles.logoContainer}>
                    <OptimizedImage
                      source={episode.logo}
                      contentFit="contain"
                      style={styles.logoImage}
                      priority="high"
                      width={300}
                      quality={100}
                    />
                  </View>
                ) : (
                  <Text style={styles.episodeTitle} numberOfLines={2}>
                    {episode?.showTitle || "Episode"}
                  </Text>
                )}

                {/* Duration and watch progress */}
                <View style={styles.progressContainer}>
                  {progressPercentage > 0 && (
                    <View style={styles.progressBarBackground}>
                      <View
                        style={[
                          styles.progressBar,
                          { width: `${progressPercentage * 100}%` },
                        ]}
                      />
                    </View>
                  )}
                  <Text style={styles.progressText}>
                    {progressPercentage > 0
                      ? `${formatTimeFromSeconds(episode?.watchHistory?.playbackTime || 0)} - ${formatTimeFromSeconds(episode?.duration ? episode.duration / 1000 : 0)}`
                      : formatTimeFromSeconds(
                          episode?.duration ? episode.duration / 1000 : 0,
                        )}
                  </Text>
                </View>

                {/* Play button */}
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={handlePlayEpisode}
                >
                  <Ionicons
                    name={progressPercentage > 0 ? "play-forward" : "play"}
                    size={20}
                    color={Colors.dark.whiteText}
                  />
                  <Text style={styles.playButtonText}>
                    {progressPercentage > 0
                      ? "Continue Watching"
                      : "Play Episode"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ImageBackground>
        </View>

        {/* Info section */}
        <View style={styles.infoSection}>
          {/* Episode description - fallback to metadata overview */}
          {(episode?.episode?.description || episode?.metadata?.overview) && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.descriptionTitle}>Synopsis</Text>
              <Text style={styles.descriptionText}>
                {episode?.episode?.description || episode?.metadata?.overview}
              </Text>
            </View>
          )}

          {/* Show info quick access */}
          <View style={styles.showInfoContainer}>
            <Text style={styles.sectionTitle}>Show Information</Text>

            <TouchableOpacity
              style={styles.showInfoCard}
              onPress={handleGoToShow}
            >
              <OptimizedImage
                source={{ uri: showData.posterURL }}
                placeholder={{
                  uri: `data:image/png;base64,${showData.posterBlurhash}`,
                }}
                style={styles.showPoster}
                contentFit="cover"
                placeholderContentFit="cover"
                width={80}
                quality={75}
              />

              <View style={styles.showInfoContent}>
                <Text style={styles.showTitle} numberOfLines={1}>
                  {showData?.showTitle}
                </Text>
                <Text style={styles.showMetadata}>
                  Season {seasonNumber} • {showData.totalSeasons}{" "}
                  {showData.totalSeasons === 1 ? "Season" : "Seasons"}
                </Text>
                {showData.metadata?.genres &&
                  showData.metadata.genres.length > 0 && (
                    <Text style={styles.showGenres} numberOfLines={1}>
                      {showData.metadata.genres
                        .slice(0, 3)
                        .map((g: any) => g.name)
                        .join(" • ")}
                    </Text>
                  )}
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color={Colors.dark.videoDescriptionText}
              />
            </TouchableOpacity>
          </View>

          {/* Guest Stars Section */}
          {episode?.guestStars && episode.guestStars.length > 0 && (
            <View style={styles.castContainer}>
              <Text style={styles.castTitle}>Guest Stars</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.castList}
              >
                {episode?.guestStars.map((actor) => (
                  <View key={actor.id} style={styles.castMember}>
                    <View style={styles.castImageContainer}>
                      {actor.profile_path &&
                      actor.profile_path.trim() !== "" &&
                      actor.profile_path !== null ? (
                        <OptimizedImage
                          source={{
                            uri: `https://image.tmdb.org/t/p/w500${actor.profile_path}`,
                          }}
                          style={styles.castImage}
                          contentFit="cover"
                          priority="normal"
                          width={120}
                          quality={75}
                        />
                      ) : (
                        <View
                          style={[styles.castImage, styles.castPlaceholder]}
                        >
                          <Ionicons
                            name="person"
                            size={40}
                            color={Colors.dark.videoDescriptionText}
                          />
                        </View>
                      )}
                    </View>
                    <View style={styles.castInfo}>
                      <Text style={styles.castName} numberOfLines={2}>
                        {actor.name}
                      </Text>
                      {actor.character && (
                        <Text style={styles.castCharacter} numberOfLines={2}>
                          {actor.character}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Cast Section */}
          {episode?.cast && episode.cast.length > 0 && (
            <View style={styles.castContainer}>
              <Text style={styles.castTitle}>Cast</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.castList}
              >
                {episode?.cast.map((actor) => (
                  <View key={actor.id} style={styles.castMember}>
                    <View style={styles.castImageContainer}>
                      {actor.profile_path &&
                      actor.profile_path.trim() !== "" &&
                      actor.profile_path !== null ? (
                        <OptimizedImage
                          source={{
                            uri: `https://image.tmdb.org/t/p/w200${actor.profile_path}`,
                          }}
                          style={styles.castImage}
                          contentFit="cover"
                          priority="normal"
                          width={120}
                          quality={75}
                        />
                      ) : (
                        <View
                          style={[styles.castImage, styles.castPlaceholder]}
                        >
                          <Ionicons
                            name="person"
                            size={40}
                            color={Colors.dark.videoDescriptionText}
                          />
                        </View>
                      )}
                    </View>
                    <View style={styles.castInfo}>
                      <Text style={styles.castName} numberOfLines={2}>
                        {actor.name}
                      </Text>
                      {actor.character && (
                        <Text style={styles.castCharacter} numberOfLines={2}>
                          {actor.character}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </ScrollView>
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
  headerInfoButton: {
    padding: 8,
  },

  // Content styles
  content: {
    flex: 1,
  },

  // Hero section styles
  heroSection: {
    minHeight: 280,
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
  heroContentContainer: {
    flex: 1,
    justifyContent: "flex-end",
    position: "relative",
    zIndex: 1,
  },
  heroContent: {
    padding: 20,
    paddingBottom: 30,
  },
  episodeMetadata: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  episodeNumber: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 4,
    color: Colors.dark.brandPrimary,
    fontSize: 14,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  hdrBadge: {
    backgroundColor: Colors.dark.brandPrimary,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  hdrText: {
    color: Colors.dark.whiteText,
    fontSize: 10,
    fontWeight: "700",
  },
  episodeTitle: {
    color: Colors.dark.whiteText,
    fontSize: 28,
    fontWeight: "bold",
    lineHeight: 34,
    marginBottom: 16,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressBarBackground: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    height: 4,
    marginBottom: 8,
    width: "100%",
  },
  progressBar: {
    backgroundColor: Colors.dark.brandPrimary,
    borderRadius: 2,
    height: "100%",
  },
  progressText: {
    color: Colors.dark.whiteText,
    fontSize: 12,
    fontWeight: "500",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
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
  logoContainer: {
    height: 60,
    marginBottom: 20,
    width: 300,
  },
  logoImage: {
    height: "100%",
    width: "100%",
  },

  // Info section styles
  infoSection: {
    padding: 20,
  },
  descriptionContainer: {
    marginBottom: 24,
  },
  descriptionTitle: {
    color: Colors.dark.whiteText,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  descriptionText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    lineHeight: 20,
  },
  showInfoContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: Colors.dark.whiteText,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  showInfoCard: {
    alignItems: "center",
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 12,
    elevation: 2,
    flexDirection: "row",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  showPoster: {
    borderRadius: 8,
    height: 120,
    width: 80,
  },
  showInfoContent: {
    flex: 1,
    marginLeft: 16,
  },
  showTitle: {
    color: Colors.dark.whiteText,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  showMetadata: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    marginBottom: 4,
  },
  showGenres: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 12,
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

  // Cast section styles
  castContainer: {
    marginBottom: 24,
  },
  castTitle: {
    color: Colors.dark.whiteText,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  castList: {
    gap: 16,
    paddingHorizontal: 4,
  },
  castMember: {
    width: 80,
  },
  castImageContainer: {
    borderRadius: 8,
    elevation: 2,
    height: 120,
    marginBottom: 8,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    width: 80,
  },
  castImage: {
    height: "100%",
    width: "100%",
  },
  castInfo: {
    alignItems: "center",
  },
  castName: {
    color: Colors.dark.whiteText,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
    textAlign: "center",
  },
  castCharacter: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 11,
    textAlign: "center",
  },
  castPlaceholder: {
    alignItems: "center",
    backgroundColor: Colors.dark.cardBackground,
    justifyContent: "center",
  },
});
