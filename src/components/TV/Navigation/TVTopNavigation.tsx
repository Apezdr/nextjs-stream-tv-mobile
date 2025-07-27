/* eslint-disable @typescript-eslint/no-require-imports */
// TVTopNavigation.tsx

import LottieView from "lottie-react-native";
import React, { useCallback, useState } from "react";
import { StyleSheet, View, Platform, TVFocusGuideView } from "react-native";
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import ProfileButton from "./ProfileButton";
import TopNavItem from "./TopNavItem";

import { Colors } from "@/src/constants/Colors";
import {
  NAVIGATION_ROUTES,
  TOP_NAV_CONFIG,
} from "@/src/constants/TopNavConstants";

interface TVTopNavigationProps {
  currentRoute?: string;
}

const TVTopNavigation: React.FC<TVTopNavigationProps> = ({ currentRoute }) => {
  const [isNavBarFocused, setIsNavBarFocused] = useState(false);

  // Use Shared Values for animating height and padding
  const animatedHeight = useSharedValue(TOP_NAV_CONFIG.HEIGHT);
  const animatedPaddingVertical = useSharedValue(12);

  const handleFocus = useCallback(() => {
    setIsNavBarFocused(true);
    // Animate height and padding when focused
    animatedHeight.value = withTiming(TOP_NAV_CONFIG.HEIGHT, {
      duration: 200,
      easing: Easing.inOut(Easing.cubic),
    });
    animatedPaddingVertical.value = withTiming(12, {
      duration: 200,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [animatedHeight, animatedPaddingVertical]);

  const handleBlur = useCallback(() => {
    setIsNavBarFocused(false);
    // Animate height and padding when blurred
    animatedHeight.value = withTiming(
      TOP_NAV_CONFIG.HEIGHT_COLLAPSED as number,
      {
        duration: 200,
        easing: Easing.inOut(Easing.cubic),
      },
    );
    animatedPaddingVertical.value = withTiming(1, {
      duration: 200,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [animatedHeight, animatedPaddingVertical]);

  // Define animated styles using useAnimatedStyle (automatically workletized)
  const containerAnimatedStyle = useAnimatedStyle(() => {
    return {
      height: animatedHeight.value,
    };
  });

  const navigationContentAnimatedStyle = useAnimatedStyle(() => {
    return {
      paddingVertical: animatedPaddingVertical.value,
    };
  });

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      {Platform.isTV ? (
        <TVFocusGuideView
          style={styles.focusGuide}
          autoFocus
          trapFocusLeft
          trapFocusRight
          trapFocusUp
          onFocus={handleFocus}
          onBlur={handleBlur}
        >
          <Animated.View
            style={[styles.navigationContent, navigationContentAnimatedStyle]}
          >
            <View style={styles.leftSection}>
              <ProfileButton />
            </View>

            <View style={styles.centerSection}>
              <TVFocusGuideView
                style={styles.navItemsContainer}
                autoFocus
                trapFocusUp
                trapFocusDown={false}
              >
                {NAVIGATION_ROUTES.map((route, idx) => (
                  <TopNavItem
                    key={route.key}
                    route={route}
                    isActive={currentRoute === route.path}
                    hasTVPreferredFocus={idx === 1}
                    isNavBarFocused={isNavBarFocused}
                  />
                ))}
              </TVFocusGuideView>
            </View>

            <View style={styles.rightSection}>
              <LottieView
                source={require("@/src/assets/lottie/logo-in.json")}
                style={styles.logo}
                autoPlay
                loop={false}
                resizeMode="contain"
              />
            </View>
          </Animated.View>
        </TVFocusGuideView>
      ) : (
        <Animated.View
          style={[styles.navigationContent, navigationContentAnimatedStyle]}
        >
          <View style={styles.leftSection}>
            <ProfileButton />
          </View>
          <View style={styles.centerSection}>
            <View style={styles.navItemsContainer}>
              {NAVIGATION_ROUTES.map((route) => (
                <TopNavItem
                  key={route.key}
                  route={route}
                  isActive={currentRoute === route.path}
                  isNavBarFocused={isNavBarFocused}
                />
              ))}
            </View>
          </View>
          <View style={styles.rightSection}>
            <LottieView
              source={require("@/src/assets/lottie/logo-in.json")}
              style={styles.logo}
              autoPlay
              loop={false}
              resizeMode="contain"
            />
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  centerSection: {
    alignItems: "center",
    flex: 2,
    justifyContent: "center",
  },
  container: {
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    elevation: 8,
    height: TOP_NAV_CONFIG.HEIGHT,
    left: 0,
    position: "absolute",
    right: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    top: 0,
    zIndex: 1000, // default
  },
  focusGuide: {
    flex: 1,
  },
  leftSection: {
    alignItems: "flex-start",
    flex: 1,
    justifyContent: "center",
  },
  logo: {
    height: 40,
    tintColor: Colors.dark.whiteText,
    width: 120,
  },
  navItemsContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  navigationContent: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: 40,
    paddingVertical: 12, // default expanded
  },
  rightSection: {
    alignItems: "flex-end",
    flex: 1,
    justifyContent: "center",
  },
});

export default TVTopNavigation;
