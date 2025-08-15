// src/components/TV/GlobalBackdrop.tsx

import { Image } from "expo-image";
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
  useEffect,
} from "react";
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  Animated,
} from "react-native";

import { useBackdrop, useBackdropActions } from "@/src/hooks/useBackdrop";
import {
  BackdropComponentRef,
  BackdropOptions,
} from "@/src/utils/BackdropManager";

type GlobalBackdropProps = object;

const GlobalBackdrop = forwardRef<BackdropComponentRef, GlobalBackdropProps>(
  (_props, ref) => {
    // Use Zustand state instead of local state
    const { url, blurhash, visible, message } = useBackdrop();
    const { show, hide, update, setMessage } = useBackdropActions();

    // Animation values
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const messageOpacity = useRef(new Animated.Value(0)).current;

    // Helper to stop any in-flight and start a new fade animation
    const animateOpacity = useCallback(
      (
        anim: Animated.Value,
        toValue: number,
        duration: number = 300,
        onComplete?: () => void,
      ) => {
        anim.stopAnimation();
        Animated.timing(anim, {
          toValue,
          duration,
          useNativeDriver: true,
        }).start(onComplete);
      },
      [],
    );

    // Expose imperative API that delegates to Zustand actions
    useImperativeHandle(
      ref,
      () => ({
        show: (newUrl: string, options?: BackdropOptions) => {
          if (!newUrl) return;
          show(newUrl, options);
        },

        hide: (options?: { fade?: boolean; duration?: number }) => {
          hide(options);
        },

        update: (newUrl: string, newBlurhash?: string) => {
          if (!newUrl) return;
          update(newUrl, newBlurhash);
        },

        setMessage: (newMessage?: string) => {
          setMessage(newMessage);
        },
      }),
      [show, hide, update, setMessage],
    );

    // Handle animations based on Zustand state changes
    useEffect(() => {
      if (visible) {
        animateOpacity(fadeAnim, 1, 300);
      } else {
        animateOpacity(fadeAnim, 0, 300);
      }
    }, [visible, fadeAnim, animateOpacity]);

    useEffect(() => {
      if (message) {
        animateOpacity(messageOpacity, 1, 200);
      } else {
        animateOpacity(messageOpacity, 0, 200);
      }
    }, [message, messageOpacity, animateOpacity]);

    // If nothing to show, render nothing
    if (!visible || !url) {
      return null;
    }

    return (
      <Animated.View
        style={[styles.container, { opacity: fadeAnim }]}
        pointerEvents="none"
        key={url}
      >
        {/* Full‑screen backdrop image */}
        <Image
          key={url} // Add key to prevent unnecessary re-renders of same URL
          source={{ uri: url }}
          style={styles.backdropImage}
          contentFit="cover"
          placeholderContentFit="cover"
          transition={1000}
          placeholder={
            blurhash ? { uri: `data:image/png;base64,${blurhash}` } : undefined
          }
          cachePolicy="memory-disk" // Improve caching
          priority="high" // Prioritize backdrop loading
        />

        {/* Dark dim overlay for contrast */}
        <View style={styles.overlay} />

        {/* Centered spinner + message */}
        {message && (
          <View style={styles.centerContainer} pointerEvents="none">
            <Animated.View
              style={{ opacity: messageOpacity, alignItems: "center" }}
            >
              <ActivityIndicator
                size="large"
                color="#FFFFFF"
                style={styles.spinner}
              />
              <Text style={styles.messageText}>{message}</Text>
            </Animated.View>
          </View>
        )}
      </Animated.View>
    );
  },
);

GlobalBackdrop.displayName = "GlobalBackdrop";

const styles = StyleSheet.create({
  backdropImage: {
    ...StyleSheet.absoluteFillObject,
  },
  centerContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0, // behind page content
  },
  messageText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "500",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  spinner: {
    marginBottom: 16,
  },
});

export default GlobalBackdrop;
