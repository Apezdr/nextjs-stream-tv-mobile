// src/components/OptimizedTabBar.tsx
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { View, Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabBarIcon } from "@/src/components/TabBarIcon";
import {
  MOBILE_TAB_COLORS,
  MOBILE_TAB_CONFIG,
  MOBILE_NAVIGATION_ROUTES,
} from "@/src/constants/MobileNavConstants";

/**
 * Optimized tab bar that maintains React Navigation compatibility
 */
export default function OptimizedTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const { bottom } = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.tabBar,
        {
          paddingBottom: Math.max(bottom, MOBILE_TAB_CONFIG.TAB_BAR_PADDING),
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        // Find the matching route config from our defined routes
        const routeConfig = MOBILE_NAVIGATION_ROUTES.find(
          (config) => config.path === route.name,
        );

        // Safety check - should not happen with proper (tabs) structure
        if (!routeConfig) {
          return null;
        }

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
          navigation.emit({
            type: "tabLongPress",
            target: route.key,
          });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tabButton}
          >
            <View
              style={[styles.tabContent, isFocused && styles.tabContentFocused]}
            >
              {/* Background pill for focused state */}
              {isFocused && <View style={styles.pillBackground} />}

              {/* Tab content */}
              <View style={styles.contentContainer}>
                {/* Icon */}
                <TabBarIcon
                  name={
                    isFocused
                      ? routeConfig?.focusedIcon || routeConfig?.icon
                      : routeConfig?.icon
                  }
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
                      style={[
                        styles.label,
                        { color: MOBILE_TAB_COLORS.ACTIVE_TINT },
                      ]}
                      numberOfLines={1}
                    >
                      {routeConfig?.title || options.title || route.name}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
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
  tabBar: {
    backgroundColor: MOBILE_TAB_COLORS.BACKGROUND,
    borderTopColor: MOBILE_TAB_COLORS.BORDER,
    borderTopWidth: 1,
    flexDirection: "row",
    minHeight: MOBILE_TAB_CONFIG.TAB_BAR_HEIGHT,
    paddingHorizontal: 16,
    paddingTop: MOBILE_TAB_CONFIG.TAB_BAR_PADDING,
  },
  tabButton: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 60,
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
