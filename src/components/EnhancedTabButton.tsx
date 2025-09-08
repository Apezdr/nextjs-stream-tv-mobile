// src/components/EnhancedTabButton.tsx
import { TabTriggerSlotProps } from "expo-router/ui";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabBarIcon } from "@/src/components/TabBarIcon";
import {
  MOBILE_TAB_COLORS,
  MOBILE_TAB_CONFIG,
  type MobileNavigationRoute,
} from "@/src/constants/MobileNavConstants";

export interface EnhancedTabButtonProps extends TabTriggerSlotProps {
  route: MobileNavigationRoute;
}

export function EnhancedTabButton({
  route,
  isFocused,
  ...props
}: EnhancedTabButtonProps) {
  const { bottom } = useSafeAreaInsets();

  // Native-performance animations
  const scaleAnim = useRef(new Animated.Value(isFocused ? 1 : 1)).current;
  const pillOpacityAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const labelWidthAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const iconColorAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: isFocused ? 1.05 : 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true, // ✅ Native performance
      }),
      Animated.timing(pillOpacityAnim, {
        toValue: isFocused ? 1 : 0,
        duration: 200,
        useNativeDriver: true, // ✅ Native performance
      }),
      Animated.timing(labelWidthAnim, {
        toValue: isFocused ? 1 : 0,
        duration: 220,
        useNativeDriver: false, // Width animation requires layout
      }),
      Animated.timing(iconColorAnim, {
        toValue: isFocused ? 1 : 0,
        duration: 200,
        useNativeDriver: false, // Color interpolation
      }),
    ]).start();
  }, [isFocused]);

  const iconColor = iconColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      MOBILE_TAB_COLORS.INACTIVE_TINT,
      MOBILE_TAB_COLORS.ACTIVE_TINT,
    ],
  });

  return (
    <Pressable
      {...props}
      style={[
        styles.tabButton,
        {
          paddingBottom: Math.max(bottom, MOBILE_TAB_CONFIG.TAB_BAR_PADDING),
        },
      ]}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={route.title}
    >
      <Animated.View
        style={[styles.tabContent, { transform: [{ scale: scaleAnim }] }]}
      >
        {/* Animated pill background */}
        <Animated.View
          style={[
            styles.pillBackground,
            {
              opacity: pillOpacityAnim,
            },
          ]}
        />

        {/* Tab content container */}
        <View style={styles.contentContainer}>
          {/* Icon */}
          <TabBarIcon
            name={isFocused ? route.focusedIcon || route.icon : route.icon}
            size={MOBILE_TAB_CONFIG.ICON_SIZE}
            // Use animated color for smooth transitions
            color={iconColor as any}
            style={styles.icon}
          />

          {/* Animated label */}
          <Animated.View
            style={[
              styles.labelContainer,
              {
                opacity: labelWidthAnim,
                transform: [
                  {
                    scaleX: labelWidthAnim,
                  },
                ],
              },
            ]}
          >
            <Text
              style={[styles.label, { color: MOBILE_TAB_COLORS.ACTIVE_TINT }]}
              numberOfLines={1}
            >
              {route.title}
            </Text>
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  icon: {
    marginRight: 0,
  },
  label: {
    fontSize: MOBILE_TAB_CONFIG.LABEL_FONT_SIZE,
    fontWeight: "600",
    textAlign: "center",
  },
  labelContainer: {
    marginLeft: 6,
    overflow: "hidden",
  },
  pillBackground: {
    backgroundColor: MOBILE_TAB_COLORS.ACTIVE_BACKGROUND,
    borderRadius: 999,
    bottom: -8,
    left: -12,
    position: "absolute",
    right: -12,
    top: -8,
  },
  tabButton: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 60,
    paddingTop: MOBILE_TAB_CONFIG.TAB_BAR_PADDING, // Ensure minimum touch target
  },
  tabContent: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
});
