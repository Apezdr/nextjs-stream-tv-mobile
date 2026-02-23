// src/components/TV/GlobalBackdrop.tsx

import { Image } from "expo-image";
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
  useEffect,
  useState,
} from "react";
import { View, StyleSheet, Text, ActivityIndicator } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
  SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

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

    // Animation values using Reanimated shared values
    const fadeAnim = useSharedValue(0);
    const messageOpacity = useSharedValue(0);

    // Track rendering state
    const [shouldRender, setShouldRender] = useState(false);
    const [displayUrl, setDisplayUrl] = useState<string | null>(null);
    const [displayBlurhash, setDisplayBlurhash] = useState<string | undefined>(
      undefined,
    );

    // Use refs to track animation state to avoid rapid state updates
    const animationInProgress = useRef(false);
    const pendingUrl = useRef<string | null>(null);
    const pendingBlurhash = useRef<string | undefined>(undefined);

    // Helper to safely animate opacity with Reanimated
    const animateOpacity = useCallback(
      (
        sharedValue: SharedValue<number>,
        toValue: number,
        duration: number = 300,
        onComplete?: () => void,
      ) => {
        // Cancel any existing animation on this shared value
        cancelAnimation(sharedValue);

        // Start new animation with completion callback
        sharedValue.value = withTiming(toValue, { duration }, (finished) => {
          if (finished && onComplete) {
            scheduleOnRN(onComplete);
          }
        });
      },
      [],
    );

    // Function to handle showing content
    const showContent = useCallback(
      (newUrl: string, newBlurhash?: string | undefined) => {
        // If we're mid-animation, store for later
        if (animationInProgress.current) {
          pendingUrl.current = newUrl;
          if (newBlurhash !== undefined) {
            pendingBlurhash.current = newBlurhash;
          }
          return;
        }

        animationInProgress.current = true;

        // If already showing something different, do a crossfade
        if (shouldRender && displayUrl && displayUrl !== newUrl) {
          // Quick fade out
          animateOpacity(fadeAnim, 0, 150, () => {
            // Update content
            setDisplayUrl(newUrl);
            setDisplayBlurhash(newBlurhash);

            // Fade back in
            animateOpacity(fadeAnim, 1, 300, () => {
              animationInProgress.current = false;

              // Check if there's a pending URL to show
              if (pendingUrl.current && pendingUrl.current !== newUrl) {
                const nextUrl = pendingUrl.current;
                const nextBlurhash = pendingBlurhash.current;
                pendingUrl.current = null;
                pendingBlurhash.current = undefined;
                showContent(nextUrl, nextBlurhash);
              }
            });
          });
        } else {
          // Fresh show - just update and fade in
          setShouldRender(true);
          setDisplayUrl(newUrl);
          setDisplayBlurhash(newBlurhash);

          animateOpacity(fadeAnim, 1, 1300, () => {
            animationInProgress.current = false;

            // Check for pending updates
            if (pendingUrl.current) {
              const nextUrl = pendingUrl.current;
              const nextBlurhash = pendingBlurhash.current;
              pendingUrl.current = null;
              pendingBlurhash.current = undefined;
              showContent(nextUrl, nextBlurhash);
            }
          });
        }
      },
      [shouldRender, displayUrl, fadeAnim, animateOpacity],
    );

    // Function to handle hiding content
    const hideContent = useCallback(() => {
      if (!shouldRender) return;

      // Clear any pending updates
      pendingUrl.current = null;
      pendingBlurhash.current = undefined;

      // Cancel current animation if any
      cancelAnimation(fadeAnim);

      animationInProgress.current = true;

      animateOpacity(fadeAnim, 0, 1300, () => {
        setShouldRender(false);
        setDisplayUrl(null);
        setDisplayBlurhash(undefined);
        animationInProgress.current = false;
      });
    }, [shouldRender, fadeAnim, animateOpacity]);

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

    // Main effect to respond to Zustand state changes
    useEffect(() => {
      if (url && visible) {
        showContent(url, blurhash ? blurhash : undefined);
      } else if (!visible) {
        hideContent();
      }
    }, [url, blurhash, visible, showContent, hideContent]);

    // Handle message opacity separately
    useEffect(() => {
      if (message) {
        animateOpacity(messageOpacity, 1, 200);
      } else {
        animateOpacity(messageOpacity, 0, 200);
      }
    }, [message, messageOpacity, animateOpacity]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        cancelAnimation(fadeAnim);
        cancelAnimation(messageOpacity);
      };
    }, [fadeAnim, messageOpacity]);

    // Animated styles using useAnimatedStyle
    const backdropAnimatedStyle = useAnimatedStyle(() => {
      return {
        ...StyleSheet.absoluteFillObject,
        opacity: fadeAnim.value,
      };
    });

    const messageAnimatedStyle = useAnimatedStyle(() => {
      return {
        opacity: messageOpacity.value,
      };
    });

    // Don't render if we shouldn't
    if (!shouldRender || !displayUrl) {
      return (
        <View style={styles.container}>
          <View style={styles.overlay} />
        </View>
      );
    }

    return (
      <View style={styles.container} pointerEvents="none">
        {/* Full‑screen backdrop image with fade animation */}
        <Animated.View style={backdropAnimatedStyle}>
          <Image
            source={{ uri: displayUrl }}
            style={styles.backdropImage}
            contentFit="cover"
            placeholderContentFit="cover"
            transition={1000}
            placeholder={
              displayBlurhash
                ? { uri: `data:image/png;base64,${displayBlurhash}` }
                : undefined
            }
            cachePolicy="memory-disk"
            priority="high"
          />
        </Animated.View>

        {/* Dark dim overlay for contrast */}
        <View style={styles.overlay} />

        {/* Centered spinner + message */}
        {message && (
          <View style={styles.centerContainer} pointerEvents="none">
            <Animated.View
              style={[{ alignItems: "center" }, messageAnimatedStyle]}
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
      </View>
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
    backgroundColor: "rgba(0, 0, 0, 0.4)",
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
