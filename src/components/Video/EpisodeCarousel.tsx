import Ionicons from "@expo/vector-icons/Ionicons";
import * as React from "react";
import { useRef, useCallback, useTransition, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TVFocusGuideView,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

import OptimizedImage from "../common/OptimizedImage";

import EpisodeProgressBar from "@/src/components/TV/MediaInfo/EpisodeProgressBar";
import { Colors } from "@/src/constants/Colors";
import { TVDeviceEpisode } from "@/src/data/types/content.types";

interface EpisodeCarouselProps {
  episodes: TVDeviceEpisode[];
  currentEpisodeNumber: number;
  onEpisodeSelect: (episode: TVDeviceEpisode) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

const EpisodeCarousel = React.memo(
  function EpisodeCarousel({
    episodes,
    currentEpisodeNumber,
    onEpisodeSelect,
    isLoading = false,
    disabled = false,
  }: EpisodeCarouselProps) {
    const scrollViewRef = useRef<ScrollView>(null);
    const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const collapseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isScrollingRef = useRef(false);
    const currentEpisodeRef = useRef<View>(null);

    // React 19 optimized focus state management - Container focus only
    const [isPending, startTransition] = useTransition();

    // Animation values for focus state - use height to tuck/reveal
    // TODO: FEATURE ENHANCEMENT - Fix focus guide breaking when carousel is collapsed
    // Instead of animating the height of the scroll view container, we should:
    // 1. Apply a translateY transform to the scroll view content to move it up/down
    // 2. Animate the height of the container separately to maintain clipping bounds
    // 3. This approach would preserve the existing expand/collapse functionality while
    //    ensuring the TVFocusGuideView doesn't break when the carousel is collapsed
    // Benefits:
    // - Focus guide remains intact and functional in collapsed state
    // - Smoother animation as content slides rather than height-clips
    // - Better TV remote navigation experience
    // - Maintains all existing visual behaviors and timing
    const containerHeight = useSharedValue(0); // Start with 0 height to allow label positioning outside
    const contentOpacity = useSharedValue(0); // Start hidden
    const labelOpacity = useSharedValue(1); // Start with label visible
    const episodesFadeOpacity = useSharedValue(0); // For fade-in effect of episodes

    // Episodes are already stable from props, no need to re-memoize

    // Memoize current episode index for scroll positioning
    const currentEpisodeIndex = useMemo(() => {
      return episodes.findIndex(
        (ep) => ep.episodeNumber === currentEpisodeNumber,
      );
    }, [episodes, currentEpisodeNumber]);

    // Auto-scroll to current episode when component mounts or episodes change
    React.useEffect(() => {
      if (
        scrollViewRef.current &&
        episodes.length > 0 &&
        currentEpisodeIndex >= 0
      ) {
        // Scroll to position with some delay to ensure layout is complete
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({
            x: currentEpisodeIndex * 145, // Approximate item width + margin
            animated: false,
          });
        }, 100);
      }
    }, [currentEpisodeIndex, episodes.length]);

    // React 19 optimized animation control functions
    // Shared values are stable references, no need to include in dependencies
    const expandCarousel = useCallback(() => {
      // First fade out the label quickly
      labelOpacity.value = withTiming(0, {
        duration: 150,
        easing: Easing.out(Easing.cubic),
      });
      // Then expand height and fade in content
      containerHeight.value = withTiming(180, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      contentOpacity.value = withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      // Fade in episodes with slight delay for staggered effect
      episodesFadeOpacity.value = withTiming(1, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Shared values are stable, no dependencies needed

    const collapseCarousel = useCallback(() => {
      // First fade out episodes quickly
      episodesFadeOpacity.value = withTiming(0, {
        duration: 150,
        easing: Easing.in(Easing.cubic),
      });
      // Then collapse height and fade out content
      containerHeight.value = withTiming(
        0,
        {
          duration: 250,
          easing: Easing.in(Easing.cubic),
        },
        (finished) => {
          // Only fade in the label after height animation completes
          if (finished) {
            labelOpacity.value = withTiming(1, {
              duration: 200,
              easing: Easing.out(Easing.cubic),
            });
          }
        },
      );
      contentOpacity.value = withTiming(0, {
        duration: 250,
        easing: Easing.in(Easing.cubic),
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Shared values are stable, no dependencies needed

    // Episode-level focus handlers for proper collapse management
    const handleEpisodeFocus = useCallback(() => {
      // Cancel any pending collapse since a child gained focus
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
        collapseTimeoutRef.current = null;
      }
      // Expand the carousel if not already expanded
      startTransition(() => {
        expandCarousel();
      });
    }, [expandCarousel]); // startTransition is stable

    const handleEpisodeBlur = useCallback(() => {
      // Don't collapse while scrolling - we're just between pages
      if (isScrollingRef.current) {
        return;
      }
      // Schedule collapse after short delay to ensure no other episode immediately gains focus
      collapseTimeoutRef.current = setTimeout(() => {
        collapseTimeoutRef.current = null;
        startTransition(() => {
          collapseCarousel();
        });
      }, 300); // 300ms delay for cross-platform TV compatibility
    }, [collapseCarousel]); // startTransition is stable

    // React 19 optimized single container focus handlers
    const handleContainerFocus = useCallback(() => {
      // Non-urgent: UI animations via useTransition
      startTransition(() => {
        expandCarousel();
      });
    }, [expandCarousel]); // startTransition is stable

    // Memoized scroll handlers to prevent inline function recreation
    const handleScrollBeginDrag = useCallback(() => {
      isScrollingRef.current = true;
      const timeoutRef = collapseTimeoutRef.current;
      // Cancel any pending collapse since we're scrolling
      if (timeoutRef) {
        clearTimeout(timeoutRef);
        collapseTimeoutRef.current = null;
      }
    }, []);

    const handleMomentumScrollEnd = useCallback(() => {
      // Scrolling fully stopped
      isScrollingRef.current = false;
      const timeoutRef = collapseTimeoutRef.current;
      // Clear any leftover collapse timer if focus is still inside
      if (timeoutRef) {
        clearTimeout(timeoutRef);
        collapseTimeoutRef.current = null;
      }
    }, []);

    // Memoized episode selection handler
    const handleEpisodeSelect = useCallback(
      (episode: TVDeviceEpisode) => {
        if (!disabled) {
          onEpisodeSelect(episode);
        }
      },
      [onEpisodeSelect, disabled],
    );

    // Cleanup timeouts on unmount
    React.useEffect(() => {
      const animationTimeout = animationTimeoutRef.current;
      const collapseTimeout = collapseTimeoutRef.current;

      return () => {
        if (animationTimeout) {
          clearTimeout(animationTimeout);
        }
        if (collapseTimeout) {
          clearTimeout(collapseTimeout);
        }
      };
    }, []);

    // Animated style for the container - height-based tucking
    const animatedContainerStyle = useAnimatedStyle(() => {
      return {
        height: containerHeight.value,
      };
    });

    // Animated style for the episode content
    const animatedContentStyle = useAnimatedStyle(() => {
      return {
        opacity: contentOpacity.value,
      };
    });

    // Animated style for the "View Available Episodes" label
    const animatedLabelStyle = useAnimatedStyle(() => {
      return {
        opacity: labelOpacity.value,
      };
    });

    // Animated style for episodes fade-in
    const animatedEpisodesStyle = useAnimatedStyle(() => {
      return {
        opacity: episodesFadeOpacity.value,
      };
    });

    // Memoize expensive calculations for performance
    const formatDuration = useCallback((milliseconds: number): string => {
      const seconds = Math.floor(milliseconds / 1000);
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m`;
    }, []);

    // Memoize destinations array to prevent TVFocusGuideView re-renders
    const focusDestinations = useMemo(() => {
      return currentEpisodeRef.current ? [currentEpisodeRef.current] : [];
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentEpisodeNumber]); // Only recreate when current episode changes

    // Show loading placeholder or actual content
    if (isLoading) {
      return (
        <Animated.View style={[styles.container, animatedContainerStyle]}>
          <TVFocusGuideView
            autoFocus
            destinations={[]} // No destinations during loading
            style={styles.focusGuide}
            trapFocusLeft
            trapFocusRight
            trapFocusDown
            onFocus={handleContainerFocus}
          >
            <Text style={styles.sectionTitle}>Episodes</Text>

            {/* "View Available Episodes" label - shown when collapsed */}
            <Animated.View
              style={[styles.viewEpisodesLabel, animatedLabelStyle]}
            >
              <Text style={styles.viewEpisodesText}>
                - View Available Episodes -
              </Text>
            </Animated.View>

            <Animated.View
              style={[animatedContentStyle, animatedEpisodesStyle]}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                {/* Loading placeholders with fade-in */}
                {Array.from({ length: 5 }).map((_, index) => (
                  <View
                    key={index}
                    style={[styles.episodeItem, styles.placeholderItem]}
                  >
                    <View
                      style={[styles.thumbnail, styles.placeholderThumbnail]}
                    />
                    <View style={[styles.placeholderText, { width: 80 }]} />
                    <View style={[styles.placeholderText, { width: 120 }]} />
                  </View>
                ))}
              </ScrollView>
            </Animated.View>
          </TVFocusGuideView>
        </Animated.View>
      );
    }

    return (
      <Animated.View style={[styles.container, animatedContainerStyle]}>
        <TVFocusGuideView
          autoFocus
          destinations={focusDestinations}
          style={styles.focusGuide}
          trapFocusLeft
          trapFocusRight
          trapFocusDown
          onFocus={handleContainerFocus}
        >
          {/* "View Available Episodes" label - shown when collapsed */}
          <Animated.View
            style={[styles.viewEpisodesLabel, animatedLabelStyle]}
            focusable={false}
          >
            <View style={styles.viewEpisodesContent}>
              <Ionicons
                name="chevron-down"
                size={16}
                color="#CCCCCC"
                style={styles.viewEpisodesArrow}
              />
              <Text style={styles.viewEpisodesText}>
                View Available Episodes
              </Text>
              <Ionicons
                name="chevron-down"
                size={16}
                color="#CCCCCC"
                style={styles.viewEpisodesArrow}
              />
            </View>
          </Animated.View>
          <Animated.View style={[animatedContentStyle, animatedEpisodesStyle]}>
            <Text style={styles.sectionTitle}>Episodes</Text>
            <ScrollView
              ref={scrollViewRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              fadingEdgeLength={50}
              onScrollBeginDrag={handleScrollBeginDrag}
              onMomentumScrollEnd={handleMomentumScrollEnd}
            >
              {episodes.map((episode) => {
                const episodeId = `episode-${episode.episodeNumber}`;
                return (
                  <Pressable
                    key={episode.episodeNumber}
                    ref={
                      episode.episodeNumber === currentEpisodeNumber
                        ? currentEpisodeRef
                        : null
                    }
                    focusable={!disabled}
                    style={({ focused }) => [
                      styles.episodeItem,
                      episode.episodeNumber === currentEpisodeNumber &&
                        styles.currentEpisode,
                      focused && !disabled && styles.episodeItemFocused,
                      disabled && styles.episodeItemDisabled,
                    ]}
                    onPress={() => handleEpisodeSelect(episode)}
                    onFocus={handleEpisodeFocus}
                    onBlur={handleEpisodeBlur}
                  >
                    <View style={styles.thumbnailContainer}>
                      <OptimizedImage
                        source={episode.thumbnail}
                        placeholder={
                          episode.thumbnailBlurhash
                            ? {
                                uri: `data:image/png;base64,${episode.thumbnailBlurhash}`,
                              }
                            : undefined
                        }
                        style={styles.thumbnail}
                        contentFit="cover"
                        placeholderContentFit="cover"
                      />
                      <View style={styles.episodeNumberOverlay}>
                        <Text style={styles.episodeNumberText}>
                          {episode.episodeNumber}
                        </Text>
                      </View>
                      {episode.hdr && episode.hdr !== "10-bit SDR (BT.709)" && (
                        <View style={styles.hdrBadge}>
                          <Text style={styles.hdrText}>HDR</Text>
                        </View>
                      )}
                      {episode.watchHistory?.isWatched && (
                        <View style={styles.watchedBadge}>
                          <Text style={styles.watchedText}>✓</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.episodeTitle} numberOfLines={1}>
                      {episode.title}
                    </Text>

                    {/* Progress bar */}
                    <View style={styles.progressBarContainer}>
                      <EpisodeProgressBar
                        watchHistory={episode.watchHistory}
                        duration={episode.duration}
                      />
                      <Text style={styles.durationText}>
                        {formatDuration(episode.duration)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        </TVFocusGuideView>
      </Animated.View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function for React.memo to prevent unnecessary re-renders
    return (
      prevProps.currentEpisodeNumber === nextProps.currentEpisodeNumber &&
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.onEpisodeSelect === nextProps.onEpisodeSelect &&
      prevProps.episodes.length === nextProps.episodes.length &&
      // Deep comparison of episodes array - check if episodes actually changed
      prevProps.episodes.every((prevEpisode, index) => {
        const nextEpisode = nextProps.episodes[index];
        return (
          nextEpisode &&
          prevEpisode.episodeNumber === nextEpisode.episodeNumber &&
          prevEpisode.title === nextEpisode.title &&
          prevEpisode.thumbnail === nextEpisode.thumbnail &&
          prevEpisode.duration === nextEpisode.duration &&
          prevEpisode.hdr === nextEpisode.hdr &&
          // Compare watch history if it exists
          ((!prevEpisode.watchHistory && !nextEpisode.watchHistory) ||
            (prevEpisode.watchHistory?.isWatched ===
              nextEpisode.watchHistory?.isWatched &&
              prevEpisode.watchHistory?.playbackTime ===
                nextEpisode.watchHistory?.playbackTime))
        );
      })
    );
  },
);

export default EpisodeCarousel;

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  focusGuide: {
    width: "100%",
  },
  viewEpisodesLabel: {
    alignItems: "center",
    bottom: -18,
    justifyContent: "center",
    left: 0,
    paddingVertical: 8,
    position: "absolute",
    right: 0,
  },
  viewEpisodesContent: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  viewEpisodesText: {
    color: "#CCCCCC",
    fontSize: 12,
    fontStyle: "italic",
    letterSpacing: 0.5,
    marginHorizontal: 8,
    opacity: 0.9,
    textAlign: "center",
  },
  viewEpisodesArrow: {
    opacity: 0.9,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    paddingHorizontal: 40,
  },
  scrollContent: {
    paddingHorizontal: 40,
    paddingVertical: 5,
  },
  episodeItem: {
    alignItems: "center",
    borderRadius: 8,
    marginRight: 15,
    padding: 5,
    width: 130,
  },
  episodeItemFocused: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    transform: [{ scale: 1.05 }],
  },
  episodeItemDisabled: {
    opacity: 0.5,
  },
  currentEpisode: {
    borderColor: Colors.dark.tint,
    borderWidth: 2,
  },
  thumbnailContainer: {
    marginBottom: 5,
    position: "relative",
  },
  thumbnail: {
    borderRadius: 6,
    height: 73,
    width: 130,
  },
  episodeNumberOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 4,
    bottom: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: "absolute",
  },
  episodeNumberText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  episodeTitle: {
    color: "#FFFFFF",
    fontSize: 12,
    marginBottom: 4,
    textAlign: "center",
    width: "100%",
  },
  progressBarContainer: {
    paddingHorizontal: 5,
    width: "100%",
  },
  durationText: {
    color: "#999999",
    fontSize: 10,
    marginTop: 2,
    textAlign: "right",
  },
  hdrBadge: {
    backgroundColor: "#FFD700",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: "absolute",
    right: 4,
    top: 4,
  },
  hdrText: {
    color: "#000000",
    fontSize: 10,
    fontWeight: "bold",
  },
  watchedBadge: {
    alignItems: "center",
    backgroundColor: Colors.dark.tint,
    borderRadius: 12,
    bottom: 4,
    height: 24,
    justifyContent: "center",
    position: "absolute",
    right: 4,
    width: 24,
  },
  watchedText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  // Loading placeholder styles
  placeholderItem: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  placeholderThumbnail: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 5,
  },
  placeholderText: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    height: 10,
    marginVertical: 4,
  },
});
