// src/components/OptimizedTabBar.tsx
// expo-router vendors its own copy of the bottom-tabs types; importing from
// @react-navigation/bottom-tabs yields a structurally different (and
// incompatible) BottomTabBarProps than the one <Tabs> actually passes.
import { BlurView } from "expo-blur";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabBarIcon } from "@/src/components/TabBarIcon";
import {
  MOBILE_NAVIGATION_ROUTES,
  MOBILE_TAB_COLORS,
  MOBILE_TAB_CONFIG,
  MobileNavigationRoute,
} from "@/src/constants/MobileNavConstants";

const ACTIVE_FLEX = 2;
const INACTIVE_FLEX = 0.76;
const SPRING_CONFIG = { damping: 28, stiffness: 60 };
const PILL_HEIGHT = 48;

interface AnimatedTabProps {
  route: { key: string; name: string };
  isFocused: boolean;
  options: { tabBarAccessibilityLabel?: string; title?: string };
  routeConfig: MobileNavigationRoute;
  onPress: () => void;
  onLongPress: () => void;
}

function AnimatedTab({
  route,
  isFocused,
  options,
  routeConfig,
  onPress,
  onLongPress,
}: AnimatedTabProps) {
  const progress = useSharedValue(isFocused ? 1 : 0);
  const flexValue = useSharedValue(isFocused ? ACTIVE_FLEX : INACTIVE_FLEX);

  useEffect(() => {
    if (isFocused) {
      progress.value = withSpring(1, SPRING_CONFIG);
      flexValue.value = withSpring(ACTIVE_FLEX, SPRING_CONFIG);
    } else {
      progress.value = withTiming(0, { duration: 180 });
      flexValue.value = withTiming(INACTIVE_FLEX, { duration: 180 });
    }
  }, [isFocused, progress, flexValue]);

  const containerStyle = useAnimatedStyle(() => ({
    flex: flexValue.value,
  }));

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [
        MOBILE_TAB_COLORS.INACTIVE_BACKGROUND,
        MOBILE_TAB_COLORS.ACTIVE_BACKGROUND,
      ],
    ),
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.65, 1], [0, 0, 1]),
    maxWidth: interpolate(progress.value, [0, 1], [0, 120]),
  }));

  return (
    <Animated.View style={[styles.tabButton, containerStyle]}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel}
        onPress={onPress}
        onLongPress={onLongPress}
        style={[
          styles.pressable,
          isFocused ? { opacity: 1 } : { opacity: 0.85 },
        ]}
      >
        <Animated.View style={[styles.pill, pillStyle]}>
          <TabBarIcon
            name={
              isFocused
                ? routeConfig.focusedIcon || routeConfig.icon
                : routeConfig.icon
            }
            size={MOBILE_TAB_CONFIG.ICON_SIZE}
            color={
              isFocused
                ? MOBILE_TAB_COLORS.ACTIVE_TINT
                : MOBILE_TAB_COLORS.INACTIVE_TINT
            }
          />
          <Animated.Text
            style={[
              styles.label,
              { color: MOBILE_TAB_COLORS.ACTIVE_TINT },
              labelStyle,
              isFocused
                ? { paddingRight: 12, marginLeft: 8 }
                : { paddingRight: 0, marginLeft: 0 },
            ]}
            numberOfLines={1}
          >
            {routeConfig.title || options.title || route.name}
          </Animated.Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export default function OptimizedTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const { bottom } = useSafeAreaInsets();

  return (
    <BlurView
      intensity={50}
      tint="dark"
      experimentalBlurMethod="dimezisBlurView"
      style={[styles.outerContainer, { paddingBottom: Math.max(bottom, 12) }]}
    >
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const routeConfig = MOBILE_NAVIGATION_ROUTES.find(
            (config) => config.path === route.name,
          );

          if (!routeConfig) return null;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          return (
            <AnimatedTab
              key={route.key}
              route={route}
              isFocused={isFocused}
              options={options}
              routeConfig={routeConfig}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: MOBILE_TAB_CONFIG.LABEL_FONT_SIZE,
    fontWeight: "700",
    overflow: "hidden",
  },
  outerContainer: {
    // Absolutely positioned so screen content extends behind it,
    // giving the BlurView something to blur.
    bottom: 0,
    left: 0,
    paddingHorizontal: 12,
    paddingTop: 12,
    position: "absolute",
    right: 0,
  },
  pill: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    height: PILL_HEIGHT,
    // flex-start + paddingLeft keeps the icon anchored at a fixed position.
    // justifyContent:"center" would shift the icon left as the label grows.
    justifyContent: "flex-start",
    overflow: "hidden",
    paddingHorizontal: 12,
    width: "100%",
  },
  pressable: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  tabBar: {
    alignItems: "center",
    backgroundColor: MOBILE_TAB_COLORS.CONTAINER_BACKGROUND,
    borderColor: MOBILE_TAB_COLORS.BORDER,
    borderRadius: 999,
    borderWidth: 1,
    elevation: 12,
    flexDirection: "row",
    minHeight: MOBILE_TAB_CONFIG.TAB_BAR_HEIGHT,
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowColor: MOBILE_TAB_COLORS.SHADOW,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  tabButton: {
    alignItems: "center",
    justifyContent: "center",
  },
});
