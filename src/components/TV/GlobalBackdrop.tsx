// src/components/TV/GlobalBackdrop.tsx

import { Image } from "expo-image";
import React, {
  forwardRef,
  useImperativeHandle,
  useState,
  useRef,
  useCallback,
} from "react";
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  Animated,
} from "react-native";

import {
  BackdropComponentRef,
  BackdropOptions,
} from "@/src/utils/BackdropManager";

type GlobalBackdropProps = object;

const GlobalBackdrop = forwardRef<BackdropComponentRef, GlobalBackdropProps>(
  (_props, ref) => {
    // Visual state
    const [url, setUrl] = useState<string | null>(null);
    const [blurhash, setBlurhash] = useState<string | null>(null);
    const [visible, setVisible] = useState(false);
    const [message, setMessageState] = useState<string | undefined>(undefined);

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

    // Expose imperative API: show, hide, update, setMessage
    useImperativeHandle(
      ref,
      () => ({
        show: (newUrl: string, options?: BackdropOptions) => {
          if (!newUrl) return;
          setUrl(newUrl);
          setBlurhash(options?.blurhash ?? null);
          setMessageState(options?.message);
          setVisible(true);

          if (options?.message) {
            animateOpacity(messageOpacity, 1, 200);
          }
          const dur = options?.duration ?? (options?.fade ? 300 : 0);
          animateOpacity(fadeAnim, 1, dur);
        },

        hide: (options?: { fade?: boolean; duration?: number }) => {
          const dur = options?.duration ?? (options?.fade ? 300 : 0);
          animateOpacity(messageOpacity, 0, 150);
          animateOpacity(fadeAnim, 0, dur, () => {
            setVisible(false);
            setUrl(null);
            setBlurhash(null);
            setMessageState(undefined);
          });
        },

        update: (newUrl: string, newBlurhash?: string) => {
          if (!newUrl) return;
          if (newUrl !== url) {
            setUrl(newUrl);
            setBlurhash(newBlurhash ?? null);
            // keep message intact
          }
        },

        setMessage: (newMessage?: string) => {
          if (newMessage !== message) {
            if (newMessage) {
              setMessageState(newMessage);
              animateOpacity(messageOpacity, 1, 200);
            } else {
              animateOpacity(messageOpacity, 0, 200, () => {
                setMessageState(undefined);
              });
            }
          }
        },
      }),
      [animateOpacity, fadeAnim, messageOpacity, url, message],
    );

    // If nothing to show, render nothing
    if (!visible || !url) {
      return null;
    }

    return (
      <Animated.View
        style={[styles.container, { opacity: fadeAnim }]}
        pointerEvents="none"
      >
        {/* Full‑screen backdrop image */}
        <Image
          source={{ uri: url }}
          style={styles.backdropImage}
          contentFit="cover"
          placeholderContentFit="cover"
          transition={1000}
          placeholder={
            blurhash ? { uri: `data:image/png;base64,${blurhash}` } : undefined
          }
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
