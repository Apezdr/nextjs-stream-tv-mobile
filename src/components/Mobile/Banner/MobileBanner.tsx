import { ImageBackground } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useState, useRef, useMemo } from "react";
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  ViewStyle,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { Colors } from "@/src/constants/Colors";
import { useBanner } from "@/src/data/hooks/useContent";
import { BannerItem } from "@/src/data/types/content.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { useDimensions } from "@/src/hooks/useDimensions";

interface MobileBannerProps {
  style?: ViewStyle;
  autoScroll?: boolean;
  autoScrollInterval?: number;
}

// Only the velocity threshold is constant
const VELOCITY_THRESHOLD = 600;

export default function MobileBanner({
  style,
  autoScroll = true,
  autoScrollInterval = 5000,
}: MobileBannerProps) {
  const router = useRouter();
  const { show: showBackdrop } = useBackdropManager();
  const insets = useSafeAreaInsets();

  // Get dynamic dimensions that will update on orientation changes
  const { window, screen } = useDimensions();

  // Calculate derived values based on current dimensions
  const screenWidth = window.width;
  const screenHeight = window.height;
  const fullScreenHeight = screen.height;
  const BANNER_HEIGHT = Math.min(screenHeight * 0.78, 540);
  const SWIPE_THRESHOLD = screenWidth * 0.15;

  const {
    data: bannerData,
    isLoading: isBannerLoading,
    error: bannerError,
  } = useBanner();

  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const autoScrollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Animation values for enhanced transitions
  const bannerOpacity = useSharedValue(1);
  const contentOpacity = useSharedValue(1);
  const isHorizontalSwipe = useSharedValue(false);

  const currentBanner = useMemo(() => {
    if (!bannerData || bannerData.length === 0) return null;
    return bannerData[currentBannerIndex] as BannerItem;
  }, [bannerData, currentBannerIndex]);

  const navigateToIndex = useCallback(
    (nextIndex: number) => {
      if (!bannerData || bannerData.length <= 1) return;

      // Simplified fade sequence: fade out content, change banner, fade in content
      contentOpacity.value = withTiming(0, { duration: 200 }, () => {
        scheduleOnRN(setCurrentBannerIndex, nextIndex);
        contentOpacity.value = withTiming(1, { duration: 220 });
      });
    },
    [bannerData, contentOpacity],
  );

  const navigateToNext = useCallback(() => {
    if (!bannerData || bannerData.length <= 1) return;
    const nextIndex = (currentBannerIndex + 1) % bannerData.length;
    navigateToIndex(nextIndex);
  }, [bannerData, currentBannerIndex, navigateToIndex]);

  const navigateToPrev = useCallback(() => {
    if (!bannerData || bannerData.length <= 1) return;
    const prevIndex =
      (currentBannerIndex - 1 + bannerData.length) % bannerData.length;
    navigateToIndex(prevIndex);
  }, [bannerData, currentBannerIndex, navigateToIndex]);

  // Auto-scroll with focus awareness
  const resetAutoScrollTimer = useCallback(() => {
    if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current);
    if (autoScroll && bannerData && bannerData.length > 1) {
      autoScrollTimerRef.current = setTimeout(() => {
        navigateToNext();
      }, autoScrollInterval);
    }
  }, [autoScroll, bannerData, autoScrollInterval, navigateToNext]);

  React.useEffect(() => {
    resetAutoScrollTimer();
    return () => {
      if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current);
    };
  }, [resetAutoScrollTimer]);

  // Pause auto-scroll when screen loses focus to improve performance
  useFocusEffect(
    useCallback(() => {
      // Resume auto-scroll when screen comes into focus
      resetAutoScrollTimer();

      return () => {
        // Pause auto-scroll when screen loses focus
        if (autoScrollTimerRef.current) {
          clearTimeout(autoScrollTimerRef.current);
          autoScrollTimerRef.current = null;
        }
      };
    }, [resetAutoScrollTimer]),
  );

  // Animated styles for enhanced transitions
  const animatedBannerStyle = useAnimatedStyle(() => ({
    opacity: bannerOpacity.value,
  }));

  const animatedContentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  // ✅ Helper: pause auto-scroll while touching
  const pauseAutoScroll = useCallback(() => {
    if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current);
  }, []);

  // ✅ Helper: resume auto-scroll a moment after interaction
  const resumeAutoScrollSoon = useCallback(() => {
    if (!autoScroll) return;
    if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current);
    autoScrollTimerRef.current = setTimeout(() => {
      resetAutoScrollTimer();
    }, 1200);
  }, [autoScroll, resetAutoScrollTimer]);

  // Enhanced pan gesture with improved vertical scrolling support
  const pan = Gesture.Pan()
    .shouldCancelWhenOutside(false) // Don't cancel when moving outside
    .maxPointers(1) // Single finger only
    .activeOffsetX([-2, 2]) // Activate after moving 2px horizontally
    .failOffsetY([-20, 20]) // Fail if moving 20px vertically first
    .onBegin(() => {
      scheduleOnRN(pauseAutoScroll);
      isHorizontalSwipe.value = false;
    })
    .onUpdate((e) => {
      const deltaX = Math.abs(e.translationX);
      const deltaY = Math.abs(e.translationY);

      // Detect if this is primarily a horizontal swipe
      if (deltaX > deltaY && deltaX > 10) {
        isHorizontalSwipe.value = true;
      }

      // Only provide visual feedback for horizontal swipes
      if (isHorizontalSwipe.value) {
        // Slight opacity feedback during swipe instead of translation
        const swipeProgress = Math.min(deltaX / SWIPE_THRESHOLD, 1);
        contentOpacity.value = 1 - swipeProgress * 0.3;
      }
    })
    .onEnd((e) => {
      const shouldGoNext =
        e.velocityX < -VELOCITY_THRESHOLD || e.translationX < -SWIPE_THRESHOLD;
      const shouldGoPrev =
        e.velocityX > VELOCITY_THRESHOLD || e.translationX > SWIPE_THRESHOLD;

      if (isHorizontalSwipe.value && shouldGoNext) {
        scheduleOnRN(navigateToNext);
      } else if (isHorizontalSwipe.value && shouldGoPrev) {
        scheduleOnRN(navigateToPrev);
      } else {
        // Reset opacity if swipe wasn't sufficient
        contentOpacity.value = withTiming(1, { duration: 200 });
      }

      isHorizontalSwipe.value = false;
      scheduleOnRN(resumeAutoScrollSoon);
    })
    .onFinalize(() => {
      // Ensure content opacity is restored if gesture was cancelled
      contentOpacity.value = withTiming(1, { duration: 150 });
    });

  // Tap press still uses your TouchableOpacity handler
  const handleBannerPress = useCallback(() => {
    if (!currentBanner) return;

    if (currentBanner.backdrop) {
      showBackdrop(currentBanner.backdrop, {
        fade: true,
        duration: 300,
        blurhash: currentBanner.backdropBlurhash,
      });
    }

    // Navigate to media info page
    router.push({
      pathname: "/(mobile)/(protected)/media-info/[id]",
      params: {
        id: currentBanner.id,
        type: currentBanner.type,
      },
    });
  }, [currentBanner, router, showBackdrop]);

  // Extend to absolute screen edge - more aggressive approach
  const statusBarHeight = fullScreenHeight - screenHeight; // True status bar + notch height
  const extendedBannerStyle = {
    ...styles.bannerContainer,
    height: BANNER_HEIGHT + Math.max(insets.top, statusBarHeight),
    marginTop: -Math.max(insets.top, statusBarHeight),
  };

  // Loading / error / empty
  if (isBannerLoading) {
    return (
      <View style={[extendedBannerStyle, style]}>
        <View
          style={[
            styles.loadingContainer,
            { paddingTop: Math.max(insets.top, statusBarHeight) },
          ]}
        >
          <ActivityIndicator color={Colors.dark.brandPrimary} size="large" />
          <Text style={styles.loadingText}>Loading featured content...</Text>
        </View>
      </View>
    );
  }

  if (bannerError) {
    return (
      <View style={[extendedBannerStyle, style]}>
        <View
          style={[
            styles.errorContainer,
            { paddingTop: Math.max(insets.top, statusBarHeight) },
          ]}
        >
          <Text style={styles.errorText}>Failed to load featured content</Text>
        </View>
      </View>
    );
  }

  if (!currentBanner) return null;

  return (
    <View style={[extendedBannerStyle, style]}>
      {/* Enhanced animated content with GestureDetector */}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.bannerContent, animatedBannerStyle]}>
          <TouchableOpacity
            style={styles.bannerTouchable}
            onPress={handleBannerPress}
            activeOpacity={0.95}
          >
            <ImageBackground
              source={{ uri: currentBanner.backdrop }}
              placeholder={{
                uri: `data:image/png;base64,${currentBanner.backdropBlurhash}`,
              }}
              placeholderContentFit="cover"
              transition={300}
              style={styles.bannerBackground}
              contentFit="cover"
              // Optional: pause auto-scroll while finger is down
              onTouchStart={pauseAutoScroll}
              onTouchEnd={resumeAutoScrollSoon}
            >
              {/* Gradient overlay */}
              <View style={styles.gradientOverlay} />

              {/* Content overlay with fade animation */}
              <Animated.View
                style={[
                  styles.contentOverlay,
                  { paddingTop: Math.max(insets.top, statusBarHeight) },
                  animatedContentStyle,
                ]}
              >
                {currentBanner.logo ? (
                  <View style={styles.logoContainer}>
                    <ImageBackground
                      source={{ uri: currentBanner.logo }}
                      style={styles.logoImage}
                      contentFit="contain"
                    />
                  </View>
                ) : (
                  <Text style={styles.bannerTitle} numberOfLines={2}>
                    {currentBanner.title}
                  </Text>
                )}

                {currentBanner.metadata.overview && (
                  <Text style={styles.bannerOverview} numberOfLines={3}>
                    {currentBanner.metadata.overview}
                  </Text>
                )}

                <View style={styles.metadataContainer}>
                  {currentBanner.metadata.vote_average > 0 && (
                    <View style={styles.ratingContainer}>
                      <Text style={styles.ratingText}>
                        ⭐ {currentBanner.metadata.vote_average.toFixed(1)}
                      </Text>
                    </View>
                  )}

                  {currentBanner.metadata.release_date && (
                    <View style={styles.yearContainer}>
                      <Text style={styles.yearText}>
                        {new Date(
                          currentBanner.metadata.release_date,
                        ).getFullYear()}
                      </Text>
                    </View>
                  )}

                  {currentBanner.metadata.genres.length > 0 && (
                    <View style={styles.genreContainer}>
                      <Text style={styles.genreText} numberOfLines={1}>
                        {currentBanner.metadata.genres
                          .slice(0, 2)
                          .map((g) => g.name)
                          .join(" • ")}
                      </Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleBannerPress}
                >
                  <Text style={styles.actionButtonText}>▶ Watch Now</Text>
                </TouchableOpacity>
              </Animated.View>

              {/* Banner indicators */}
              {bannerData && bannerData.length > 1 && (
                <View style={styles.indicatorsContainer}>
                  {bannerData.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.indicator,
                        index === currentBannerIndex && styles.indicatorActive,
                      ]}
                    />
                  ))}
                </View>
              )}
            </ImageBackground>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignSelf: "flex-start",
    backgroundColor: Colors.dark.brandPrimary,
    borderRadius: 6,
    elevation: 4,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  actionButtonText: {
    color: Colors.dark.whiteText,
    fontSize: 16,
    fontWeight: "600",
  },
  bannerBackground: {
    flex: 1,
    justifyContent: "flex-end",
    position: "relative",
  },
  bannerContainer: {
    borderBottomColor: Colors.dark.tint,
    borderBottomWidth: 3,
    marginBottom: 28,
    width: "100%", // Use percentage width for responsiveness
  },
  bannerContent: { flex: 1 },
  bannerOverview: {
    color: Colors.dark.whiteText,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  bannerTitle: {
    color: Colors.dark.whiteText,
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 12,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  bannerTouchable: { flex: 1 },
  contentOverlay: {
    bottom: 80,
    left: 20,
    position: "absolute",
    right: 20,
    zIndex: 1,
  },
  errorContainer: {
    alignItems: "center",
    backgroundColor: Colors.dark.cardBackground,
    flex: 1,
    justifyContent: "center",
  },
  errorText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 16,
    textAlign: "center",
  },
  genreContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 4,
    flex: 0,
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  genreText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 12,
    fontWeight: "500",
  },
  gradientOverlay: {
    bottom: 0,
    height: "100%",
    left: 0,
    position: "absolute",
    right: 0,
    ...Platform.select({
      default: { backgroundColor: "rgba(0, 0, 0, 0.4)" },
    }),
  },
  indicator: {
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 4,
    height: 8,
    marginHorizontal: 3,
    width: 8,
  },
  indicatorActive: { backgroundColor: Colors.dark.brandPrimary, width: 24 },
  indicatorsContainer: {
    alignItems: "center",
    bottom: 8,
    flexDirection: "row",
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
  },
  loadingContainer: {
    alignItems: "center",
    backgroundColor: Colors.dark.cardBackground,
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 16,
    marginTop: 12,
  },
  logoContainer: { height: 60, marginBottom: 12, width: 200 },
  logoImage: { height: "100%", width: "100%" },
  metadataContainer: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  ratingContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 4,
    marginBottom: 4,
    marginRight: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingText: { color: Colors.dark.whiteText, fontSize: 12, fontWeight: "600" },
  yearContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 4,
    marginBottom: 4,
    marginRight: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  yearText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 12,
    fontWeight: "500",
  },
});
