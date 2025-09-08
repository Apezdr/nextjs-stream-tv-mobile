// src/components/SimpleTabButton.tsx
import { TabTriggerSlotProps } from "expo-router/ui";
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabBarIcon } from "@/src/components/TabBarIcon";
import {
  MOBILE_TAB_COLORS,
  MOBILE_TAB_CONFIG,
  type MobileNavigationRoute,
} from "@/src/constants/MobileNavConstants";

export interface SimpleTabButtonProps extends TabTriggerSlotProps {
  route: MobileNavigationRoute;
}

export function SimpleTabButton({
  route,
  isFocused,
  ...props
}: SimpleTabButtonProps) {
  const { bottom } = useSafeAreaInsets();

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
      <View style={[styles.tabContent, isFocused && styles.tabContentFocused]}>
        {/* Background pill for focused state */}
        {isFocused && <View style={styles.pillBackground} />}

        {/* Tab content container */}
        <View style={styles.contentContainer}>
          {/* Icon */}
          <TabBarIcon
            name={isFocused ? route.focusedIcon || route.icon : route.icon}
            size={MOBILE_TAB_CONFIG.ICON_SIZE}
            color={
              isFocused
                ? MOBILE_TAB_COLORS.ACTIVE_TINT
                : MOBILE_TAB_COLORS.INACTIVE_TINT
            }
            style={styles.icon}
          />

          {/* Label - only show when focused */}
          {isFocused && (
            <View style={styles.labelContainer}>
              <Text
                style={[styles.label, { color: MOBILE_TAB_COLORS.ACTIVE_TINT }]}
                numberOfLines={1}
              >
                {route.title}
              </Text>
            </View>
          )}
        </View>
      </View>
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
    paddingTop: MOBILE_TAB_CONFIG.TAB_BAR_PADDING,
  },
  tabContent: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  tabContentFocused: {
    transform: [{ scale: 1.05 }],
  },
});
