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
  BackHandler,
  TVFocusGuideView,
  Alert,
} from "react-native";

import {
  AnimatedSidebar,
  AnimatedSidebarRef,
} from "@/src/components/TV/Navigation/AnimatedSidebar";
import SidebarItem from "@/src/components/TV/Navigation/SidebarItem";
import SidebarOverlay from "@/src/components/TV/Navigation/SidebarOverlay";
import { EXPANDED_WIDTH } from "@/src/constants/SidebarConstants";
import { useTVAppState } from "@/src/context/TVAppStateContext";
import { useSidebarState } from "@/src/hooks/useSidebarState";
import { useAuth } from "@/src/providers/AuthProvider";

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

interface TVSidebarProps {
  shouldRegisterBackButtonHandler?: boolean;
}

const TVSidebar: React.FC<TVSidebarProps> = ({
  shouldRegisterBackButtonHandler = false,
}) => {
  // Use local sidebar state management instead of global context
  const { sidebarState, setSidebarState, closeSidebar, isSidebarVisible } =
    useSidebarState();

  // Use TV app state context only for mode checking
  const { currentMode } = useTVAppState();

  // Use auth context for sign out functionality
  const { signOut } = useAuth();

  // Sidebar should be hidden only on media-info and watch pages
  const canShowSidebar =
    currentMode !== "media-info" && currentMode !== "watch";

  // State for tracking focused item
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);

  // State for tracking if sidebar has focus
  const [sidebarHasFocus, setSidebarHasFocus] = useState<boolean>(false);

  // Reference to the animated sidebar for imperative control
  const animatedSidebarRef = useRef<AnimatedSidebarRef>(null);

  // Handle focus management when sidebar state changes
  useEffect(() => {
    if (sidebarState !== "closed" && !focusedItemId) {
      setFocusedItemId(NAVIGATION_ITEMS[0].id);
    } else if (sidebarState === "closed" && focusedItemId) {
      setFocusedItemId(null);
    }
  }, [sidebarState, focusedItemId]);

  // Sync local state with animated sidebar
  useEffect(() => {
    animatedSidebarRef.current?.animateToState(sidebarState);
  }, [sidebarState]);

  // Memoized back button handler to prevent recreation
  const handleBackButton = useCallback(() => {
    // Only handle back button if we're in browse mode and sidebar is actually visible
    if (canShowSidebar && isSidebarVisible) {
      if (sidebarState === "expanded") {
        setSidebarState("minimized");
        return true;
      }
      // Don't close sidebar on back button - just toggle between minimized and expanded
      if (sidebarState === "minimized") {
        setSidebarState("expanded");
        return true;
      }
    }
    return false;
  }, [canShowSidebar, sidebarState, isSidebarVisible, setSidebarState]);

  // Handle TV navigation with back button - controlled by parent component
  useEffect(() => {
    // Only register back button handler when explicitly allowed by parent and sidebar is visible
    if (shouldRegisterBackButtonHandler && canShowSidebar && isSidebarVisible) {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        handleBackButton,
      );
      return () => subscription.remove();
    }
    // If not allowed to register or sidebar is not visible, don't register any handler
    return undefined;
  }, [
    shouldRegisterBackButtonHandler,
    canShowSidebar,
    isSidebarVisible,
    handleBackButton,
  ]);

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
          return; // Don't change sidebar state for sign out confirmation
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

        // Minimize sidebar after successful navigation (keep it visible but collapsed)
        setSidebarState("minimized");
      } catch (error) {
        console.error(
          `[TVSidebar] Navigation failed for item '${itemId}':`,
          error,
        );

        // Don't change sidebar state if navigation fails
      }
    },
    [setSidebarState, showSignOutConfirmation],
  );

  const handleItemFocus = useCallback(
    (itemId: string) => {
      setFocusedItemId(itemId);
      setSidebarHasFocus(true);
      if (sidebarState === "minimized") {
        setSidebarState("expanded");
      }
    },
    [sidebarState, setSidebarState],
  );

  // Reference to track blur timeout and current state
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentStateRef = useRef({ sidebarHasFocus, sidebarState });

  // Update ref when state changes
  useEffect(() => {
    currentStateRef.current = { sidebarHasFocus, sidebarState };
  }, [sidebarHasFocus, sidebarState]);

  // Handle focus leaving sidebar items
  const handleItemBlur = useCallback(() => {
    // Mark that sidebar no longer has focus
    setSidebarHasFocus(false);

    // Clear any existing timeout
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }

    // Set a timeout to check if focus has truly left the sidebar
    blurTimeoutRef.current = setTimeout(() => {
      // Check current state from ref to avoid stale closure
      const { sidebarHasFocus: currentHasFocus, sidebarState: currentState } =
        currentStateRef.current;

      // If sidebar still doesn't have focus and we're expanded, minimize it
      if (!currentHasFocus && currentState === "expanded") {
        setSidebarState("minimized");
        setFocusedItemId(null);
      }
    }, 300); // Longer delay to ensure focus has settled
  }, [setSidebarState]);

  // Clear timeout when focus returns to any sidebar item
  useEffect(() => {
    if (sidebarHasFocus && blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }, [sidebarHasFocus]);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  // Memoized item handlers factory to prevent inline function creation
  const createItemHandlers = useCallback(
    (itemId: string) => ({
      onPress: () => handleItemPress(itemId),
      onFocus: () => handleItemFocus(itemId),
      onBlur: handleItemBlur,
    }),
    [handleItemPress, handleItemFocus, handleItemBlur],
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
            onPress={handlers.onPress}
            onFocus={handlers.onFocus}
            onBlur={handlers.onBlur}
          />
        );
      }),
    [createItemHandlers, focusedItemId],
  );

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

      {/* Animated Sidebar with constrained focus guide */}
      <TVFocusGuideView
        style={[styles.sidebarFocusGuide, { width: EXPANDED_WIDTH }]}
        trapFocusUp={true}
        trapFocusDown={true}
        trapFocusLeft={true}
        trapFocusRight={false} // Allow right navigation to exit sidebar
        autoFocus={false}
      >
        <AnimatedSidebar ref={animatedSidebarRef}>
          <View style={styles.container}>
            {/* Navigation items - optimized rendering with memoization */}
            <View style={styles.navigationContainer}>{navigationItems}</View>
          </View>
        </AnimatedSidebar>
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
  sidebarFocusGuide: {
    bottom: 0,
    left: 0,
    pointerEvents: "box-none",
    position: "absolute",
    top: 0,
    zIndex: 1,
  },
});

export default TVSidebar;
