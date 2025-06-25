import { Ionicons } from "@expo/vector-icons";
import { forwardRef, useRef, useImperativeHandle, memo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  SharedValue,
} from "react-native-reanimated";

import { Colors } from "@/src/constants/Colors";

interface SidebarItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  onFocus?: () => void;
  isFocused?: boolean;
  textOpacity: SharedValue<number>;
}

interface SidebarItemRef {
  focus?: () => void;
}

const SidebarItem = memo(
  forwardRef<SidebarItemRef, SidebarItemProps>(
    (
      { icon, label, onPress, onFocus, isFocused = false, textOpacity },
      ref,
    ) => {
      const pressableRef = useRef<View>(null);

      // Expose focus method through ref
      useImperativeHandle(ref, () => ({
        focus: () => {
          pressableRef.current?.focus?.();
        },
      }));

      // Animated style for text opacity using Reanimated
      const animatedTextStyle = useAnimatedStyle(() => {
        return {
          opacity: textOpacity.value,
        };
      });

      return (
        <View style={styles.focusContainer}>
          <Pressable
            ref={pressableRef}
            onPress={onPress}
            onFocus={onFocus}
            style={({ focused }) => [
              styles.container,
              (focused || isFocused) && styles.focused,
            ]}
          >
            <View
              style={[
                styles.iconContainer,
                isFocused && styles.focusedIconContainer,
              ]}
            >
              <Ionicons
                name={icon}
                size={28}
                color={isFocused ? "#FFFFFF" : "#DDDDDD"}
              />
            </View>

            <Animated.Text
              style={[
                styles.label,
                animatedTextStyle,
                isFocused && styles.focusedText,
              ]}
              numberOfLines={1}
            >
              {label}
            </Animated.Text>
          </Pressable>
        </View>
      );
    },
  ),
);

SidebarItem.displayName = "SidebarItem";

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    paddingHorizontal: 11,
    paddingVertical: 12,
  },
  focusContainer: {
    marginVertical: 8,
  },
  focused: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  focusedIconContainer: {
    // Add a subtle glow effect to make focused icons stand out more
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  focusedText: {
    color: Colors.dark.whiteText,
    fontWeight: "bold",
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
  },
  label: {
    color: "#CCCCCC",
    fontSize: 18,
    fontWeight: "500",
    marginLeft: 16,
  },
});

export default SidebarItem;
