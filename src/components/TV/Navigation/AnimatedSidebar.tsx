import React, {
  forwardRef,
  useImperativeHandle,
  createContext,
  useContext,
} from "react";
import { ViewStyle, StyleSheet } from "react-native";
import Animated from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

import {
  useSidebarAnimation,
  SidebarAnimationState,
} from "@/src/hooks/useSidebarAnimation";

export interface AnimatedSidebarRef {
  animateToState: (state: SidebarAnimationState) => void;
}

interface AnimatedSidebarProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

// Context to share textOpacity with SidebarItem components
interface SidebarAnimationContextType {
  textOpacity: SharedValue<number>;
}

const SidebarAnimationContext =
  createContext<SidebarAnimationContextType | null>(null);

export const useSidebarAnimationContext = () => {
  const context = useContext(SidebarAnimationContext);
  if (!context) {
    throw new Error(
      "useSidebarAnimationContext must be used within AnimatedSidebar",
    );
  }
  return context;
};

export const AnimatedSidebar = forwardRef<
  AnimatedSidebarRef,
  AnimatedSidebarProps
>(({ children, style }, ref) => {
  const { animateToState, sidebarAnimatedStyle, textOpacity } =
    useSidebarAnimation();

  useImperativeHandle(
    ref,
    () => ({
      animateToState,
    }),
    [animateToState],
  );

  return (
    <SidebarAnimationContext.Provider value={{ textOpacity }}>
      <Animated.View style={[styles.sidebar, sidebarAnimatedStyle, style]}>
        {children}
      </Animated.View>
    </SidebarAnimationContext.Provider>
  );
});

AnimatedSidebar.displayName = "AnimatedSidebar";

const styles = StyleSheet.create({
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
});
