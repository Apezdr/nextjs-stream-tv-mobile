import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import React, { useCallback, useRef, useEffect, useMemo } from "react";
import {
  StyleSheet,
  TouchableOpacity as RNTouchableOpacity,
  Platform,
  Animated,
} from "react-native";

import { Colors } from "@/src/constants/Colors";
import {
  NavigationRoute,
  TOP_NAV_CONFIG,
} from "@/src/constants/TopNavConstants";

// Create a TV-compatible TouchableOpacity
interface TVTouchableProps
  extends React.ComponentProps<typeof RNTouchableOpacity> {
  isTVSelectable?: boolean;
  hasTVPreferredFocus?: boolean;
}
const TouchableOpacity =
  RNTouchableOpacity as React.ComponentType<TVTouchableProps>;

interface TopNavItemProps {
  route: NavigationRoute;
  isActive?: boolean;
  hasTVPreferredFocus?: boolean;
  isNavBarFocused?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

const TopNavItem: React.FC<TopNavItemProps> = ({
  route,
  isActive = false,
  hasTVPreferredFocus = false,
  isNavBarFocused = true,
  onFocus,
  onBlur,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Animated values
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(isActive ? 1 : 0.7)).current;
  const fontSizeAnim = useRef(
    new Animated.Value(isNavBarFocused ? 16 : 10),
  ).current;

  // Keep ref of pathname
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Determine active state
  const isCurrentlyActive = useMemo(() => {
    /* same logic as before */
    if (route.key === "home") {
      return (
        pathname === "/(tv)/(protected)/(browse)/" ||
        pathname === "/(tv)/(protected)/(browse)" ||
        pathname === "/" ||
        pathname.endsWith("/(browse)")
      );
    } else {
      const routePageName = route.path.split("/").pop();
      return pathname === `/${routePageName}` || pathname === route.path;
    }
  }, [pathname, route.path, route.key]);

  // Animate font size when navbar focus changes
  useEffect(() => {
    Animated.timing(fontSizeAnim, {
      toValue: isNavBarFocused ? 16 : 10,
      duration: TOP_NAV_CONFIG.ANIMATION_DURATION,
      useNativeDriver: false, // fontSize cannot use native driver
    }).start();
  }, [isNavBarFocused, fontSizeAnim]);

  const handlePress = useCallback(() => {
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = null;
    }
    router.push(route.path as any, {
      dangerouslySingular: true,
    });
  }, [router, route.path]);

  const handleFocus = useCallback(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1.1,
        duration: TOP_NAV_CONFIG.ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: TOP_NAV_CONFIG.ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      // we no longer need to animate fontSize here; useEffect handles it
    ]).start();

    if (!isCurrentlyActive) {
      focusTimeoutRef.current = setTimeout(() => {
        const currentPathname = pathnameRef.current;
        let notActive =
          route.key === "home"
            ? !(
                currentPathname === "/(tv)/(protected)/(browse)/" ||
                currentPathname === "/(tv)/(protected)/(browse)" ||
                currentPathname === "/" ||
                currentPathname.endsWith("/(browse)")
              )
            : currentPathname !== route.path;
        if (notActive)
          router.push(route.path as any, {
            dangerouslySingular: true,
          });
      }, TOP_NAV_CONFIG.FOCUS_DELAY);
    }
    onFocus?.();
  }, [
    scaleAnim,
    opacityAnim,
    isCurrentlyActive,
    router,
    route.key,
    route.path,
    onFocus,
  ]);

  const handleBlur = useCallback(() => {
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = null;
    }
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: TOP_NAV_CONFIG.ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: isCurrentlyActive ? 1 : 0.7,
        duration: TOP_NAV_CONFIG.ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      // fontSize handled by useEffect
    ]).start();
    onBlur?.();
  }, [scaleAnim, opacityAnim, isCurrentlyActive, onBlur]);

  // Sync opacity when active changes
  useEffect(() => {
    Animated.timing(opacityAnim, {
      toValue: isCurrentlyActive ? 1 : 0.6,
      duration: TOP_NAV_CONFIG.ANIMATION_DURATION,
      useNativeDriver: true,
    }).start();
  }, [isCurrentlyActive, opacityAnim]);

  // Cleanup
  useEffect(
    () => () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    },
    [],
  );

  return (
    <TouchableOpacity
      style={[styles.container, isCurrentlyActive && styles.activeContainer]}
      onPress={handlePress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      activeOpacity={1}
      isTVSelectable={Platform.isTV}
      hasTVPreferredFocus={hasTVPreferredFocus && Platform.isTV}
    >
      <Animated.View
        style={{
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        {route.icon && (
          <Ionicons
            name={route.icon}
            size={route.iconOnly ? 28 : 24}
            color={isCurrentlyActive ? Colors.dark.whiteText : "#CCCCCC"}
            style={styles.icon}
          />
        )}

        {/* Animated fontSize */}
        {!route.iconOnly && (
          <Animated.Text
            style={[
              styles.titleBase,
              { fontSize: fontSizeAnim },
              isCurrentlyActive && styles.activeTitle,
            ]}
          >
            {route.title}
          </Animated.Text>
        )}
      </Animated.View>

      {isCurrentlyActive && <Animated.View style={styles.activeIndicator} />}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  activeContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  activeIndicator: {
    backgroundColor: Colors.dark.whiteText,
    borderRadius: 2,
    bottom: 0,
    height: 3,
    left: "20%",
    position: "absolute",
    right: "20%",
  },
  activeTitle: {
    color: Colors.dark.whiteText,
  },
  container: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    minWidth: 80,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  icon: {
    marginRight: 8,
  },
  titleBase: {
    color: "#CCCCCC",
    fontWeight: "500",
  },
});

export default TopNavItem;
