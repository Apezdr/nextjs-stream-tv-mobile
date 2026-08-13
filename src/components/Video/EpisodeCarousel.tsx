import Ionicons from "@expo/vector-icons/Ionicons";
import * as React from "react";
import { useRef, useState, useCallback, useTransition, useMemo } from "react";
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
  runOnJS,
} from "react-native-reanimated";

import OptimizedImage from "../common/OptimizedImage";

import EpisodeProgressBar from "@/src/components/TV/MediaInfo/EpisodeProgressBar";
import { Colors } from "@/src/constants/Colors";
import { TVDeviceEpisode } from "@/src/data/types/content.types";

// Container height when only the "View Available Episodes" label is visible.
const COLLAPSED_HEIGHT = 30;
// Container height when the full episode strip is visible. Sized to fit the
// section title, the thumbnail, the title, and the progress bar without
// clipping the last row of pixels under `overflow: 'hidden'`.
const EXPANDED_HEIGHT = 200;
// How far the episode content has to translate downward to be hidden entirely
// below the visible label area when collapsed.
const HIDE_TRANSLATE = EXPANDED_HEIGHT - COLLAPSED_HEIGHT;

interface EpisodeCarouselProps {
  episodes: TVDeviceEpisode[];
  currentEpisodeNumber: number;
  onEpisodeSelect: (episode: TVDeviceEpisode) => void;
  isLoading?: boolean;
  disabled?: boolean;
  // Fires when the carousel finishes expanding (true) or completes its
  // collapse animation (false). Parents use this to move the show logo out
  // of the carousel's way when expanded.
  onExpandedChange?: (expanded: boolean) => void;
}

const EpisodeCarousel = React.memo(
  function EpisodeCarousel({
    episodes,
    currentEpisodeNumber,
    onEpisodeSelect,
    isLoading = false,
    disabled = false,
    onExpandedChange,
  }: EpisodeCarouselProps) {
    const scrollViewRef = useRef<ScrollView>(null);
    const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const collapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const isScrollingRef = useRef(false);
    const currentEpisodeRef = useRef<View>(null);

    // React 19 optimized focus state management - Container focus only
    const [isPending, startTransition] = useTransition();

    // Layout mode is state-driven so the container's height only reflows at
    // the boundaries of the animation (twice per cycle), not on every frame.
    // The visible transition is carried by translateY — a compositor-only
    // transform — keeping the bulk of the animation off the layout pass.
    const [carouselMode, setCarouselMode] = useState<"collapsed" | "expanded">(
      "collapsed",
    );
    const contentTranslateY = useSharedValue(HIDE_TRANSLATE); // Off-screen below
    const contentOpacity = useSharedValue(0);
    const labelOpacity = useSharedValue(1);
    const episodesFadeOpacity = useSharedValue(0);

    // Generation counter that lets us cancel a collapse's deferred layout
    // swap. The collapse animation's completion callback fires on the UI
    // thread, then queues a `runOnJS(setCarouselMode)("collapsed")` to the JS
    // thread. If the user re-enters the carousel between those two events,
    // the queued setter would otherwise win the race and leave us with
    // `carouselMode === "collapsed"` while focus sits on a current-episode
    // Pressable (container at 30, content translated off-screen — invisible).
    // `expandCarousel` bumps the generation; the deferred finalizer checks
    // its captured token and bails if the generation has moved on.
    const collapseGenRef = useRef(0);

    // Latest `onExpandedChange` callback held in a ref so the expand/collapse
    // helpers (declared with empty deps below) always see the current value
    // without re-creating themselves when the parent passes a fresh inline
    // function.
    const onExpandedChangeRef = useRef(onExpandedChange);
    onExpandedChangeRef.current = onExpandedChange;

    // Tracks the mode we last reported to the parent via `onExpandedChange`.
    // `expandCarousel` is called on every Pressable focus (including LEFT /
    // RIGHT navigation between episodes), but the parent only cares when the
    // mode genuinely transitions. Gating on this ref stops the parent from
    // seeing a flood of `(true)` callbacks while focus moves inside an already
    // expanded carousel.
    const lastNotifiedModeRef = useRef<"collapsed" | "expanded">("collapsed");

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
            x: currentEpisodeIndex * 149, // item width (134) + marginRight (15)
            animated: false,
          });
        }, 100);
      }
    }, [currentEpisodeIndex, episodes.length]);

    // Expand: flip the layout mode FIRST so the container reserves
    // EXPANDED_HEIGHT in the same frame the content begins sliding in. The
    // captions/SeekBar above snap up once instead of reflowing every frame.
    // Bumping the generation invalidates any in-flight collapse's deferred
    // finalizer so it can't race in and re-set the mode to "collapsed" after
    // we've already moved focus back into the carousel.
    const expandCarousel = useCallback(() => {
      collapseGenRef.current += 1;
      setCarouselMode("expanded");
      // Only notify the parent on a real collapsed → expanded transition.
      // Subsequent focus events that re-call expandCarousel while we're
      // already expanded are no-ops at the parent level.
      if (lastNotifiedModeRef.current !== "expanded") {
        lastNotifiedModeRef.current = "expanded";
        onExpandedChangeRef.current?.(true);
      }
      labelOpacity.value = withTiming(0, {
        duration: 150,
        easing: Easing.out(Easing.cubic),
      });
      contentTranslateY.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      contentOpacity.value = withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      episodesFadeOpacity.value = withTiming(1, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Runs on the JS thread after the collapse animation completes naturally.
    // If `expandCarousel` was called between the animation completing and this
    // running, the captured `gen` no longer matches and we skip the layout
    // swap + label fade-in. Without this gate, a late `runOnJS` from the
    // collapse's completion would override the synchronous
    // `setCarouselMode("expanded")` from the in-progress expand, leaving
    // focus on a hidden Pressable.
    const finalizeCollapse = useCallback((gen: number) => {
      if (collapseGenRef.current !== gen) return;
      setCarouselMode("collapsed");
      if (lastNotifiedModeRef.current !== "collapsed") {
        lastNotifiedModeRef.current = "collapsed";
        onExpandedChangeRef.current?.(false);
      }
      labelOpacity.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Collapse: slide the content down out of the clipped region, then flip
    // layout mode to "collapsed" in the deferred finalizer so the
    // captions/SeekBar above only snap down AFTER the visible motion ends.
    const collapseCarousel = useCallback(() => {
      episodesFadeOpacity.value = withTiming(0, {
        duration: 150,
        easing: Easing.in(Easing.cubic),
      });
      contentOpacity.value = withTiming(0, {
        duration: 250,
        easing: Easing.in(Easing.cubic),
      });
      const myGen = collapseGenRef.current;
      contentTranslateY.value = withTiming(
        HIDE_TRANSLATE,
        {
          duration: 250,
          easing: Easing.in(Easing.cubic),
        },
        (finished) => {
          if (finished) {
            runOnJS(finalizeCollapse)(myGen);
          }
        },
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [finalizeCollapse]);

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
      }, 5); // 5ms delay for cross-platform TV compatibility
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

    // Animated style for the sliding episode-content wrapper. translateY is a
    // compositor-only transform, so each frame is cheap.
    const animatedContentTransformStyle = useAnimatedStyle(() => {
      return {
        transform: [{ translateY: contentTranslateY.value }],
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

    // Track the current-episode Pressable's actual mounted node via a callback
    // ref backed by state. The previous `useMemo` read `currentEpisodeRef.current`
    // during render — but refs bind on commit (after render), so the memo
    // captured a stale (or null) value when `currentEpisodeNumber` changed,
    // which left `destinations` pointing at the wrong Pressable and broke
    // DOWN-navigation from the SeekBar into the carousel. The callback ref
    // runs on commit, so `currentEpisodeNode` is always the actually-mounted
    // Pressable.
    const [currentEpisodeNode, setCurrentEpisodeNode] = useState<View | null>(
      null,
    );
    const setCurrentEpisodeRef = useCallback((node: View | null) => {
      currentEpisodeRef.current = node;
      setCurrentEpisodeNode(node);
    }, []);
    const focusDestinations = useMemo(
      () => (currentEpisodeNode ? [currentEpisodeNode] : []),
      [currentEpisodeNode],
    );

    // Show loading placeholder or actual content
    const containerHeight =
      carouselMode === "expanded" ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;

    if (isLoading) {
      return (
        <View style={[styles.container, { height: containerHeight }]}>
          <TVFocusGuideView
            destinations={[]}
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
              style={[
                animatedContentStyle,
                animatedEpisodesStyle,
                animatedContentTransformStyle,
              ]}
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
        </View>
      );
    }

    return (
      <View style={[styles.container, { height: containerHeight }]}>
        {/* `autoFocus` intentionally omitted: with it set, the guide proactively
            claims focus on every re-render via `destinations`, which fired
            `handleEpisodeFocus` (cancelling the 300ms collapse timer) right
            after the parent moved focus to the SeekBar — leaving the carousel
            permanently expanded. `destinations` alone handles DOWN-incoming
            targeting; `onFocus` still expands on natural user navigation. */}
        <TVFocusGuideView
          destinations={focusDestinations}
          style={styles.focusGuide}
          trapFocusLeft
          trapFocusRight
          trapFocusDown
          onFocus={handleContainerFocus}
        >
          {/* "View Available Episodes" label - shown when collapsed. Pure
              visual hint, non-focusable. DOWN-from-captions routes through
              the guide's `destinations` to the current-episode Pressable
              directly, so the label never needs to capture focus. */}
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
          <Animated.View
            style={[
              animatedContentStyle,
              animatedEpisodesStyle,
              animatedContentTransformStyle,
            ]}
          >
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
                        ? setCurrentEpisodeRef
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
                      {/* Watch-progress bar overlaid on the bottom of the
                          thumbnail, Netflix-style. EpisodeProgressBar returns
                          null when there's no watch history, so the overlay
                          collapses to nothing for unwatched episodes. */}
                      <View
                        style={styles.thumbnailProgressOverlay}
                        pointerEvents="none"
                      >
                        <EpisodeProgressBar
                          watchHistory={episode.watchHistory}
                          duration={episode.duration}
                          compact
                        />
                      </View>
                    </View>
                    <Text style={styles.episodeTitle} numberOfLines={1}>
                      {episode.title}
                    </Text>
                    <Text style={styles.durationText}>
                      {formatDuration(episode.duration)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        </TVFocusGuideView>
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function for React.memo to prevent unnecessary re-renders.
    // `disabled` must be included so toggling `isEpisodeSwitching` actually
    // propagates: each Pressable's `focusable={!disabled}` only takes effect
    // when this component re-renders.
    return (
      prevProps.disabled === nextProps.disabled &&
      prevProps.currentEpisodeNumber === nextProps.currentEpisodeNumber &&
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.onEpisodeSelect === nextProps.onEpisodeSelect &&
      prevProps.onExpandedChange === nextProps.onExpandedChange &&
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
    overflow: "hidden",
    width: "100%",
  },
  focusGuide: {
    width: "100%",
  },
  viewEpisodesLabel: {
    alignItems: "center",
    height: COLLAPSED_HEIGHT,
    justifyContent: "center",
    paddingVertical: 8,
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
    // Transparent border reserves the same 2px on every item so the layout
    // doesn't shift when an item becomes the current episode (which adds a
    // visible border). With box-sizing: border-box, this also keeps the
    // thumbnail's 130px width flush inside the 134px container regardless
    // of selection state.
    borderColor: "transparent",
    borderRadius: 8,
    borderWidth: 2,
    marginRight: 15,
    paddingBottom: 5,
    width: 134,
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
  durationText: {
    color: "#999999",
    fontSize: 10,
    marginTop: 2,
    paddingHorizontal: 5,
    textAlign: "right",
    width: "100%",
  },
  thumbnailProgressOverlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
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
