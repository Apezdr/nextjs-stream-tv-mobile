import { Ionicons } from "@expo/vector-icons";
import { ImageBackground } from "expo-image";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import YoutubeSvg from "@/src/assets/third-party/youtube.svg";
import OptimizedImage from "@/src/components/common/OptimizedImage";
import { MobileActionSheet } from "@/src/components/Mobile/ActionSheet";
import { Colors } from "@/src/constants/Colors";
import {
  useTVMediaDetails,
  useMovieDetails,
} from "@/src/data/hooks/useContent";
import { TVDeviceEpisode } from "@/src/data/types/content.types";
import {
  useActionSheetConfig,
  ActionSheetContentData,
} from "@/src/hooks/useActionSheetConfig";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { useDimensions } from "@/src/hooks/useDimensions";
import { useBackdropStore } from "@/src/stores/backdropStore";
import { navigationHelper } from "@/src/utils/navigationHelper";
import {
  extractYouTubeVideoId,
  getYouTubeThumbnailUrls,
  isValidYouTubeUrl,
} from "@/src/utils/youtubeUtils";

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

  // Get dynamic dimensions
  const { window } = useDimensions();
  const { width: screenWidth, height: screenHeight } = window;

  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(
    params.season ? parseInt(params.season) : undefined,
  );

  // Action sheet state
  const [selectedEpisode, setSelectedEpisode] =
    useState<TVDeviceEpisode | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [actionSheetContext, setActionSheetContext] = useState<
    "episode" | "movie" | "show"
  >("episode");

  // Use the backdrop manager
  const { show: showBackdrop } = useBackdropManager();
  const insets = useSafeAreaInsets();

  // Debounce refresh to prevent excessive API calls
  const lastRefreshRef = useRef<number>(0);
  const REFRESH_DEBOUNCE_MS = 5000;

  // Ref for season picker ScrollView and button positions
  const seasonScrollViewRef = useRef<ScrollView>(null);
  const seasonButtonLayouts = useRef<{
    [key: number]: { x: number; width: number };
  }>({});

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

  // Derive initial season from root TV media response when none is provided
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
  const error = params.type === "movie" ? movieData.error : tvData.error;

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

    // Use the new showOverview field from our enhanced hook
    const currentGenres = mediaInfo.metadata?.genres;
    const currentCast = (mediaInfo as any)?.cast || mediaInfo.metadata?.cast;
    const currentOverview = mediaInfo.metadata?.overview;
    const showOverview = mediaInfo.metadata?.showOverview;

    return {
      displayGenres: currentGenres || [],
      displayCast: currentCast || [],
      // Season overview is in the standard location
      seasonOverview: currentOverview,
      // Show overview is in the new field
      showOverview: showOverview,
    };
  }, [params.type, mediaInfo]);

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
          // console.log("[MobileMediaInfo] Showing backdrop:", backdropUrl);
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

  // Auto-scroll to selected season when data loads or layouts change
  useEffect(() => {
    if (
      params.type === "tv" &&
      mediaInfo?.availableSeasons &&
      params.season &&
      seasonScrollViewRef.current
    ) {
      const targetSeason = parseInt(params.season);
      const buttonLayout = seasonButtonLayouts.current[targetSeason];

      if (buttonLayout) {
        // Center the button in the scroll view
        const scrollX = Math.max(
          0,
          buttonLayout.x - (screenWidth - buttonLayout.width) / 2,
        );

        setTimeout(() => {
          seasonScrollViewRef.current?.scrollTo({
            x: scrollX,
            y: 0,
            animated: true,
          });
        }, 100);
      }
    }
  }, [
    params.type,
    params.season,
    mediaInfo?.availableSeasons,
    seasonButtonLayouts.current,
  ]);

  const { generateConfig } = useActionSheetConfig();

  // Handle season button layout
  const handleSeasonButtonLayout = useCallback((season: number, event: any) => {
    const { x, width } = event.nativeEvent.layout;
    seasonButtonLayouts.current[season] = { x, width };
  }, []);

  // Handle action sheet for episodes
  const handleEpisodePress = useCallback((episode: TVDeviceEpisode) => {
    setSelectedEpisode(episode);
    setActionSheetContext("episode");
    setShowActionSheet(true);
  }, []);

  // Handle action sheet for movies
  const handleMoviePress = useCallback(() => {
    setSelectedEpisode(null);
    setActionSheetContext("movie");
    setShowActionSheet(true);
  }, []);

  const handleCloseActionSheet = useCallback(() => {
    setShowActionSheet(false);
    setSelectedEpisode(null);
    setActionSheetContext("episode");
  }, []);

  // Legacy handler for backward compatibility
  const handleCloseEpisodeActionSheet = handleCloseActionSheet;

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

      navigationHelper.navigateToWatch({
        id: params.id,
        type: params.type,
        season: selectedSeason ?? (mediaInfo as any)?.seasonNumber,
        episode: episode.episodeNumber,
        backdrop: mediaInfo?.backdrop,
        backdropBlurhash: mediaInfo?.backdropBlurhash,
      });
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

  // Handle episode restart action
  const handleRestartEpisode = useCallback(
    (episode: TVDeviceEpisode) => {
      // Show backdrop immediately for smooth transition
      if (mediaInfo?.backdrop) {
        showBackdrop(mediaInfo.backdrop, {
          fade: true,
          duration: 300,
          blurhash: mediaInfo?.backdropBlurhash,
        });
      }

      navigationHelper.navigateToWatch({
        id: params.id,
        type: params.type,
        season: selectedSeason ?? (mediaInfo as any)?.seasonNumber,
        episode: episode.episodeNumber,
        backdrop: mediaInfo?.backdrop,
        backdropBlurhash: mediaInfo?.backdropBlurhash,
        restart: true, // Add restart parameter
      });
    },
    [
      params.id,
      params.type,
      selectedSeason,
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

      navigationHelper.navigateToEpisodeInfo({
        showId: params.id,
        season: selectedSeason ?? (mediaInfo as any)?.seasonNumber,
        episode: episode.episodeNumber,
      });
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
    navigationHelper.navigateToWatch({
      id: params.id,
      type: params.type,
      backdrop: mediaInfo?.backdrop,
      backdropBlurhash: mediaInfo?.backdropBlurhash,
    });
  }, [
    params.id,
    params.type,
    router,
    mediaInfo?.backdrop,
    mediaInfo?.backdropBlurhash,
  ]);

  // Handle movie restart
  const handleRestartMovie = useCallback(() => {
    navigationHelper.navigateToWatch({
      id: params.id,
      type: params.type,
      backdrop: mediaInfo?.backdrop,
      backdropBlurhash: mediaInfo?.backdropBlurhash,
      restart: true,
    });
  }, [
    params.id,
    params.type,
    mediaInfo?.backdrop,
    mediaInfo?.backdropBlurhash,
  ]);

  // Handle show info navigation
  const handleShowInfo = useCallback(() => {
    // Navigate to show info (current page without specific episode)
    navigationHelper.navigateToMediaInfo({
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

  // Handle movie info navigation
  const handleMovieInfo = useCallback(() => {
    // For movies, this could navigate to a detailed info page or stay on current page
    // For now, we'll just close the action sheet as the user is already on the info page
    handleCloseEpisodeActionSheet();
  }, []);

  // Handle trailer press - open YouTube app or browser
  const handleTrailerPress = useCallback(async () => {
    const trailerUrl = mediaInfo?.metadata?.trailer_url;
    if (!trailerUrl || !isValidYouTubeUrl(trailerUrl)) return;

    try {
      const videoId = extractYouTubeVideoId(trailerUrl);
      if (!videoId) return;

      // Try to open in YouTube app first, fallback to browser
      const youtubeAppUrl = `youtube://watch?v=${videoId}`;
      const canOpenYouTube = await Linking.canOpenURL(youtubeAppUrl);

      if (canOpenYouTube) {
        await Linking.openURL(youtubeAppUrl);
      } else {
        await Linking.openURL(trailerUrl);
      }
    } catch (error) {
      console.error("Failed to open trailer:", error);
      // Fallback to browser
      try {
        await Linking.openURL(trailerUrl);
      } catch (fallbackError) {
        console.error("Failed to open trailer in browser:", fallbackError);
      }
    }
  }, [mediaInfo?.metadata?.trailer_url]);

  // Handle season change
  const handleSeasonChange = useCallback((newSeason: number) => {
    setSelectedSeason(newSeason);
  }, []);

  // Handle go back
  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  // === ACTION SHEET LOGIC ===

  // Create content data based on context
  const createContentData = (): ActionSheetContentData => {
    if (actionSheetContext === "episode" && selectedEpisode) {
      return {
        id: params.id,
        title: selectedEpisode.title,
        mediaType: "tv",
        seasonNumber: selectedSeason,
        episodeNumber: selectedEpisode.episodeNumber,
        backdrop: mediaInfo?.backdrop,
        backdropBlurhash: mediaInfo?.backdropBlurhash,
      };
    } else {
      return {
        id: params.id,
        title: mediaInfo?.title || "Unknown",
        mediaType: params.type,
        seasonNumber:
          params.type === "tv"
            ? (selectedSeason ?? (mediaInfo as any)?.seasonNumber)
            : undefined,
        episodeNumber: undefined,
        backdrop: mediaInfo?.backdrop,
        backdropBlurhash: mediaInfo?.backdropBlurhash,
      };
    }
  };

  const contentData = createContentData();

  // Custom handlers for backward compatibility and specific navigation needs
  const customHandlers = {
    onClose: handleCloseActionSheet,
    onPlay: (data: ActionSheetContentData) => {
      if (actionSheetContext === "episode" && selectedEpisode) {
        handlePlayEpisode(selectedEpisode);
      } else if (actionSheetContext === "movie") {
        handlePlayMovie();
      }
    },
    onRestart: (data: ActionSheetContentData) => {
      if (actionSheetContext === "episode" && selectedEpisode) {
        handleRestartEpisode(selectedEpisode);
      } else if (actionSheetContext === "movie") {
        handleRestartMovie();
      }
    },
    onInfo: (data: ActionSheetContentData) => {
      if (actionSheetContext === "episode" && selectedEpisode) {
        handleEpisodeInfo(selectedEpisode);
      } else if (actionSheetContext === "movie") {
        handleMovieInfo();
      } else if (actionSheetContext === "show") {
        handleShowInfo();
      }
    },
  };

  // Generate action sheet configuration using centralized hook
  const actionSheetConfig = generateConfig(
    contentData,
    actionSheetContext,
    customHandlers,
  );

  // Loading state
  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
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
      <View
        style={[
          styles.container,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
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
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
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
        <View style={[styles.heroSection, { height: screenHeight * 0.4 }]}>
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
                        quality={75}
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
                          {mediaInfo.metadata.vote_average != null &&
                            typeof mediaInfo.metadata.vote_average ===
                              "number" &&
                            mediaInfo.metadata.vote_average > 0 && (
                              <View style={styles.heroRatingContainer}>
                                <Text style={styles.heroRatingText}>
                                  ⭐{" "}
                                  {mediaInfo.metadata.vote_average.toFixed(1)}
                                </Text>
                              </View>
                            )}

                          <Text style={styles.heroMetadataText}>
                            {mediaInfo.metadata.releaseDate
                              ? (() => {
                                  const d = new Date(
                                    mediaInfo.metadata.releaseDate,
                                  );
                                  const mm = String(d.getMonth() + 1).padStart(
                                    2,
                                    "0",
                                  );
                                  const dd = String(d.getDate()).padStart(
                                    2,
                                    "0",
                                  );
                                  const yyyy = d.getFullYear();
                                  return `${mm}-${dd}-${yyyy}`;
                                })()
                              : ""}
                          </Text>

                          {mediaInfo.duration && (
                            <Text style={styles.heroMetadataText}>
                              {formatTimeFromMs(mediaInfo.duration)}
                            </Text>
                          )}

                          {mediaInfo.metadata.rating &&
                            typeof mediaInfo.metadata.rating === "string" && (
                              <View style={styles.heroRatingBadge}>
                                <Text style={styles.heroRatingBadgeText}>
                                  {mediaInfo.metadata.rating}
                                </Text>
                              </View>
                            )}
                        </View>

                        {/* Play button with options for movies */}
                        <View style={styles.movieButtonContainer}>
                          <TouchableOpacity
                            style={styles.playButton}
                            onPress={handlePlayMovie}
                          >
                            <Ionicons
                              name="play"
                              size={20}
                              color={Colors.dark.whiteText}
                            />
                            <Text style={styles.playButtonText}>
                              Play Movie
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.movieOptionsButton}
                            onPress={handleMoviePress}
                          >
                            <Ionicons
                              name="ellipsis-horizontal"
                              size={20}
                              color={Colors.dark.whiteText}
                            />
                          </TouchableOpacity>
                        </View>
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
              {mediaInfo.metadata.vote_average != null &&
                typeof mediaInfo.metadata.vote_average === "number" && (
                  <View style={styles.ratingContainer}>
                    <Text style={styles.ratingText}>
                      ⭐ {mediaInfo.metadata.vote_average.toFixed(1)}
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

              {mediaInfo.metadata.rating &&
                typeof mediaInfo.metadata.rating === "string" && (
                  <View style={styles.ratingBadge}>
                    <Text style={styles.ratingBadgeText}>
                      {mediaInfo.metadata.rating}
                    </Text>
                  </View>
                )}
            </View>
          )}

          {/* Genres */}
          {mergedDisplayFields.displayGenres &&
            mergedDisplayFields.displayGenres.length > 0 && (
              <View style={styles.genresContainer}>
                {mergedDisplayFields.displayGenres
                  .slice(0, 4)
                  .map((genre: any) => (
                    <View key={genre.id} style={styles.genreChip}>
                      <Text style={styles.genreText}>{genre.name}</Text>
                    </View>
                  ))}
              </View>
            )}

          {/* Overview Sections */}
          {/* Show the show overview if available and different from season overview */}
          {mergedDisplayFields.showOverview &&
            mergedDisplayFields.showOverview !==
              mergedDisplayFields.seasonOverview && (
              <View style={styles.overviewContainer}>
                <Text style={styles.overviewTitle}>Show Overview</Text>
                <Text style={styles.overviewText}>
                  {mergedDisplayFields.showOverview}
                </Text>
              </View>
            )}

          {/* Trailer Section */}
          {mediaInfo.metadata.trailer_url &&
            isValidYouTubeUrl(mediaInfo.metadata.trailer_url) && (
              <View style={styles.trailerContainer}>
                <Text style={styles.trailerTitle}>Trailer</Text>
                <TouchableOpacity
                  style={styles.trailerCard}
                  onPress={handleTrailerPress}
                >
                  <View style={styles.trailerImageContainer}>
                    <OptimizedImage
                      source={{
                        uri: getYouTubeThumbnailUrls(
                          extractYouTubeVideoId(
                            mediaInfo.metadata.trailer_url,
                          )!,
                        ).primary,
                      }}
                      style={styles.trailerImage}
                      contentFit="cover"
                      priority="normal"
                      width={400}
                      quality={75}
                    />
                    <View style={styles.trailerPlayOverlay}>
                      <View style={styles.trailerPlayButton}>
                        <Ionicons
                          name="play"
                          size={35}
                          color={Colors.dark.tint}
                        />
                      </View>
                    </View>
                    <View style={styles.trailerYouTubeBadge}>
                      <YoutubeSvg
                        width={60}
                        height={14}
                        style={styles.youtubeSvgIcon}
                      />
                    </View>
                  </View>
                  <View style={styles.trailerInfo}>
                    <Text style={styles.trailerCardTitle}>Watch Trailer</Text>
                    <Text style={styles.trailerDescription}>
                      Tap to watch the official trailer on YouTube
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

          {/* Cast Section */}
          {mergedDisplayFields.displayCast &&
            mergedDisplayFields.displayCast.length > 0 && (
              <View style={styles.castContainer}>
                <Text style={styles.castTitle}>Cast</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.castList}
                >
                  {mergedDisplayFields.displayCast
                    ?.slice(0, 10)
                    .map((actor: any) => (
                      <View key={actor.id} style={styles.castMember}>
                        <View style={styles.castImageContainer}>
                          {actor.profile_path &&
                          actor.profile_path.trim() !== "" &&
                          actor.profile_path !== null ? (
                            <OptimizedImage
                              source={{ uri: actor.profile_path }}
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
                            <Text
                              style={styles.castCharacter}
                              numberOfLines={2}
                            >
                              {actor.character}
                            </Text>
                          )}
                        </View>
                      </View>
                    ))}
                </ScrollView>
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
                    ref={seasonScrollViewRef}
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
                        onLayout={(event) =>
                          handleSeasonButtonLayout(season, event)
                        }
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
                  {/* Show season overview if available */}
                  {mergedDisplayFields.seasonOverview && (
                    <View style={styles.seasonOverviewContainer}>
                      <Text style={styles.overviewTitle}>
                        {mergedDisplayFields.showOverview
                          ? `Season ${selectedSeason} Overview`
                          : "Overview"}
                      </Text>
                      <Text style={styles.overviewText}>
                        {mergedDisplayFields.seasonOverview}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Episodes list */}
                <View style={styles.episodesSection}>
                  <Text style={styles.sectionTitle}>
                    Season {selectedSeason ?? (mediaInfo as any).seasonNumber}{" "}
                    Episodes
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
                              source={{
                                uri:
                                  episode.thumbnail &&
                                  episode.thumbnail.trim() !== ""
                                    ? episode.thumbnail
                                    : (mediaInfo?.backdrop ?? ""),
                              }}
                              placeholder={
                                episode.thumbnailBlurhash ||
                                mediaInfo?.backdropBlurhash
                                  ? {
                                      uri: `data:image/png;base64,${
                                        episode.thumbnailBlurhash ||
                                        mediaInfo?.backdropBlurhash
                                      }`,
                                    }
                                  : undefined
                              }
                              style={styles.episodeImage}
                              contentFit="cover"
                              placeholderContentFit="cover"
                              width={440}
                              quality={75}
                            />
                            <View style={styles.episodePlayOverlay}>
                              <Ionicons
                                name="play-circle"
                                size={82}
                                color="rgba(255, 255, 255, 0.9)"
                              />
                            </View>
                            {(!episode.title || episode.title.trim() === "") &&
                              mediaInfo.logo && (
                                <View style={styles.episodeLogoOverlay}>
                                  <OptimizedImage
                                    source={mediaInfo.logo}
                                    contentFit="contain"
                                    style={styles.episodeLogoOverlayImage}
                                    priority="high"
                                    width={200}
                                    quality={100}
                                  />
                                </View>
                              )}

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
                                            (episode.duration / 1000)) *
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

      {/* Action Sheet */}
      <MobileActionSheet
        visible={showActionSheet}
        onClose={handleCloseEpisodeActionSheet}
        title={actionSheetConfig.title}
        subtitle={actionSheetConfig.subtitle}
        actions={actionSheetConfig.actions}
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
  movieButtonContainer: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 12,
  },
  playButton: {
    alignItems: "center",
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
  movieOptionsButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 8,
    height: 44,
    justifyContent: "center",
    width: 44,
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
  seasonOverviewContainer: {
    marginTop: 24,
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
  episodeLogoOverlay: {
    bottom: 8,
    maxHeight: 50,
    maxWidth: 160,
    position: "absolute",
    right: 8,
  },
  episodeLogoOverlayImage: {
    height: 50,
    opacity: 0.95,
    width: 160,
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

  // Trailer section styles
  trailerContainer: {
    marginBottom: 24,
  },
  trailerTitle: {
    color: Colors.dark.whiteText,
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
  },
  trailerCard: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 12,
    elevation: 3,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  trailerImageContainer: {
    height: 200,
    position: "relative",
    width: "100%",
  },
  trailerImage: {
    height: "100%",
    width: "100%",
  },
  trailerPlayOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  trailerPlayButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 30,
    height: 60,
    justifyContent: "center",
    width: 60,
  },
  trailerYouTubeBadge: {
    alignItems: "center",
    backgroundColor: "#ffffffff",
    borderRadius: 4,
    justifyContent: "center",
    paddingVertical: 3,
    position: "absolute",
    right: 12,
    top: 12,
  },
  youtubeSvgIcon: {
    // The SVG will use its default colors
  },
  trailerInfo: {
    padding: 16,
  },
  trailerCardTitle: {
    color: Colors.dark.whiteText,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  trailerDescription: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    lineHeight: 18,
  },

  // Cast section styles
  castContainer: {
    marginBottom: 24,
  },
  castTitle: {
    color: Colors.dark.whiteText,
    fontSize: 20,
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
