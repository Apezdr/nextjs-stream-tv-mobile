import React, { useEffect, useRef } from "react";
import { StyleSheet, Animated, Pressable } from "react-native";

interface SidebarOverlayProps {
  isVisible: boolean;
  onPress: () => void;
}

const SidebarOverlay: React.FC<SidebarOverlayProps> = ({
  isVisible,
  onPress,
}) => {
  // Animation value for opacity
  const opacity = useRef(new Animated.Value(0)).current;

  // Animate overlay when visibility changes
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: isVisible ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [isVisible, opacity]);

  // Don't render if not visible
  if (!isVisible) return null;

  return (
    <Pressable
      onPress={onPress}
      style={StyleSheet.absoluteFill}
      focusable={false}
      tabIndex={-1}
      importantForAccessibility="no"
    >
      <Animated.View style={[styles.overlay, { opacity }]} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    zIndex: 999, // Add z-index between content (1) and sidebar (1000)
  },
});

export default SidebarOverlay;
