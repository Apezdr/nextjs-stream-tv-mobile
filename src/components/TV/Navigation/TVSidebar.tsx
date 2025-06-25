import { router, Href } from "expo-router";
import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  BackHandler,
  TVFocusGuideView,
  Alert,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
  runOnUI,
} from "react-native-reanimated";

import SidebarItem from "@/src/components/TV/Navigation/SidebarItem";
import SidebarOverlay from "@/src/components/TV/Navigation/SidebarOverlay";
import { useTVAppState } from "@/src/context/TVAppStateContext";
import { useAuth } from "@/src/providers/AuthProvider";

// Get screen dimensions - memoized to avoid recalculation
const SCREEN_DIMENSIONS = Dimensions.get("window");

// Define sidebar widths - exported for use in other components
export const MINIMIZED_WIDTH = 60;
export const EXPANDED_WIDTH = SCREEN_DIMENSIONS.width * (2 / 6); // 2/6 of screen width as requested

// Pre-calculate values to prevent worklet capture overhead
const SCREEN_WIDTH_FRACTION = SCREEN_DIMENSIONS.width * (2 / 6);

// Navigation items - moved outside component to prevent recreation
const NAVIGATION_ITEMS = [
  { id: "home", icon: "home", label: "Home" },
  { id: "movies", icon: "film", label: "Movies" },
  { id: "tv", icon: "tv", label: "TV Shows" },
  { id: "mylist", icon: "heart", label: "My List" },
  { id: "search", icon: "search", label: "Search" },
  { id: "settings", icon: "settings", label: "Settings" },
  { id: "signout", icon: "log-out", label: "Sign Out" },
] as const;

// Navigation routes mapping - memoized to prevent recreation
const NAVIGATION_ROUTES = {
  home: "/(tv)/(protected)/(browse)",
  movies: "/(tv)/(protected)/(browse)/movies",
  tv: "/(tv)/(protected)/(browse)/tv-shows",
  mylist: "/(tv)/(protected)/(browse)/my-list",
  search: "/(tv)/(protected)/(browse)/search",
  settings: "/(tv)/(protected)/settings",
} as const;

// Alert configuration - memoized to prevent recreation
const SIGN_OUT_ALERT_CONFIG = {
  title: "Sign Out",
  message: "Are you sure you want to sign out?",
  cancelText: "Cancel",
  confirmText: "Sign Out",
  options: { cancelable: true },
} as const;

const TVSidebar: React.FC = () => {
  // Use TV app state context
  const {
    sidebarState,
    setSidebarState,
    closeSidebar,
    isSidebarVisible,
    currentMode,
  } = useTVAppState();

  // Use auth context for sign out functionality
  const { signOut } = useAuth();

  // Sidebar should only be shown in browse mode
  const canShowSidebar = currentMode === "browse";

  // Animation values using React Native Reanimated
  const sidebarProgress = useSharedValue(0); // 0 = closed, 0.5 = minimized, 1 = expanded
  const textOpacity = useSharedValue(0);

  // State for tracking focused item
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);

  // Reference to the sidebar container for tracking focus
  const sidebarRef = useRef(null);

  // Memoized animation configurations to prevent recreation
  const animationConfig = useMemo(
    () => ({
      progress: {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      },
      opacity: {
        duration: 150,
        easing: Easing.inOut(Easing.ease),
      },
    }),
    [],
  );

  // Optimized animation function that runs on UI thread
  const animateToState = useCallback(
    (state: typeof sidebarState) => {
      "worklet";
      const targetProgress =
        state === "closed" ? 0 : state === "minimized" ? 0.5 : 1;
      const targetOpacity = state === "expanded" ? 1 : 0;

      sidebarProgress.value = withTiming(
        targetProgress,
        animationConfig.progress,
      );
      textOpacity.value = withTiming(targetOpacity, animationConfig.opacity);
    },
    [sidebarProgress, textOpacity, animationConfig],
  );

  // Handle sidebar animation based on state
  useEffect(() => {
    runOnUI(animateToState)(sidebarState);
  }, [sidebarState, animateToState]);

  // Handle focus management when sidebar state changes
  useEffect(() => {
    if (sidebarState !== "closed" && !focusedItemId) {
      setFocusedItemId(NAVIGATION_ITEMS[0].id);
    } else if (sidebarState === "closed" && focusedItemId) {
      setFocusedItemId(null);
    }
  }, [sidebarState, focusedItemId]);

  // Memoized back button handler to prevent recreation
  const handleBackButton = useCallback(() => {
    if (isSidebarVisible) {
      if (sidebarState === "expanded") {
        setSidebarState("minimized");
        return true;
      }
      if (sidebarState === "minimized") {
        setSidebarState("closed");
        return true;
      }
    }
    return false;
  }, [sidebarState, isSidebarVisible, setSidebarState]);

  // Handle TV navigation with back button
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackButton,
    );
    return () => subscription.remove();
  }, [handleBackButton]);

  // Confirmation dialog for sign out - optimized with memoized config
  const showSignOutConfirmation = useCallback(() => {
    Alert.alert(
      SIGN_OUT_ALERT_CONFIG.title,
      SIGN_OUT_ALERT_CONFIG.message,
      [
        {
          text: SIGN_OUT_ALERT_CONFIG.cancelText,
          style: "cancel",
        },
        {
          text: SIGN_OUT_ALERT_CONFIG.confirmText,
          style: "destructive",
          onPress: async () => {
            try {
              await signOut();
              // Navigation after sign out will be handled by the auth provider
            } catch (error) {
              console.error("[TVSidebar] Sign out failed:", error);
              Alert.alert("Error", "Failed to sign out. Please try again.");
            }
          },
        },
      ],
      SIGN_OUT_ALERT_CONFIG.options,
    );
  }, [signOut]);

  // Optimized item handlers with navigation functionality - using route mapping
  const handleItemPress = useCallback(
    async (itemId: string) => {
      setFocusedItemId(itemId);

      try {
        // Handle sign out separately
        if (itemId === "signout") {
          showSignOutConfirmation();
          return; // Don't minimize sidebar for sign out confirmation
        }

        // Get route from mapping - more performant than switch statement
        const route =
          NAVIGATION_ROUTES[itemId as keyof typeof NAVIGATION_ROUTES];

        if (!route) {
          console.warn(`[TVSidebar] Unknown navigation item: ${itemId}`);
          return;
        }

        // Navigate to the route
        router.push(route as Href);

        // Minimize sidebar after successful navigation
        setSidebarState("minimized");
      } catch (error) {
        console.error(
          `[TVSidebar] Navigation failed for item '${itemId}':`,
          error,
        );

        // Still manage sidebar state even if navigation fails
        if (sidebarState === "expanded") {
          setSidebarState("minimized");
        } else {
          setSidebarState("expanded");
        }
      }
    },
    [sidebarState, setSidebarState, showSignOutConfirmation],
  );

  const handleItemFocus = useCallback(
    (itemId: string) => {
      setFocusedItemId(itemId);
      if (sidebarState === "minimized") {
        setSidebarState("expanded");
      }
    },
    [sidebarState, setSidebarState],
  );

  // Memoized item handlers factory to prevent inline function creation
  const createItemHandlers = useCallback(
    (itemId: string) => ({
      onPress: () => handleItemPress(itemId),
      onFocus: () => handleItemFocus(itemId),
    }),
    [handleItemPress, handleItemFocus],
  );

  // Memoized navigation items to prevent recreation on each render
  const navigationItems = useMemo(
    () =>
      NAVIGATION_ITEMS.map((item) => {
        const handlers = createItemHandlers(item.id);
        return (
          <SidebarItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            isFocused={focusedItemId === item.id}
            textOpacity={textOpacity}
            onPress={handlers.onPress}
            onFocus={handlers.onFocus}
          />
        );
      }),
    [createItemHandlers, focusedItemId, textOpacity],
  );

  // Animated styles using React Native Reanimated with optimized constants
  const sidebarAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    // Use inline constants to prevent worklet capture overhead
    const MINIMIZED = 60;
    const EXPANDED = SCREEN_WIDTH_FRACTION;

    const width = interpolate(
      sidebarProgress.value,
      [0, 0.5, 1],
      [0, MINIMIZED, EXPANDED],
    );

    const translateX = interpolate(
      sidebarProgress.value,
      [0, 0.5, 1],
      [-MINIMIZED, 0, 0],
    );

    return {
      width,
      transform: [{ translateX }],
    };
  }, [sidebarProgress]);

  // Don't render anything if video is in fullscreen mode
  if (!canShowSidebar) {
    return null;
  }

  // Render sidebar components when allowed
  return (
    <>
      {/* Background overlay */}
      <SidebarOverlay
        isVisible={isSidebarVisible && canShowSidebar}
        onPress={closeSidebar}
      />

      {/* Sidebar with proper focus containment */}
      <TVFocusGuideView
        style={styles.sidebarFocusGuide}
        trapFocusUp={true}
        trapFocusDown={true}
        trapFocusLeft={true}
        trapFocusRight={false} // Allow right navigation to exit sidebar
        autoFocus={false} // auto focus breaks focus containment
      >
        <Animated.View
          ref={sidebarRef}
          style={[styles.sidebar, sidebarAnimatedStyle]}
        >
          <View style={styles.container}>
            {/* Navigation items - optimized rendering with memoization */}
            <View style={styles.navigationContainer}>{navigationItems}</View>
          </View>
        </Animated.View>
      </TVFocusGuideView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 20,
    paddingTop: 40,
  },
  navigationContainer: {
    flex: 1,
  },
  sidebar: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: "rgba(20, 20, 20, 0.98)", // Slightly more opaque for better visibility without shadows
    overflow: "hidden",
    elevation: 5, // Add elevation for Android
    shadowColor: "#000", // Add shadow for iOS
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  sidebarFocusGuide: {
    bottom: 0,
    left: 0,
    pointerEvents: "box-none",
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1000, // Allow touches to pass through to underlying content
  },
});

export default TVSidebar;
