import { Ionicons } from "@expo/vector-icons";
import React, { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import FocusableButton from "@/src/components/basic/TV/Parts/Button";
import { Colors } from "@/src/constants/Colors";

export interface FullScreenNoticeAction {
  label: string;
  onPress: () => void;
  /** Takes initial focus. Defaults to the first action. */
  preferred?: boolean;
}

interface FullScreenNoticeProps {
  title: string;
  message?: string | null;
  actions: FullScreenNoticeAction[];
  icon?: keyof typeof Ionicons.glyphMap;
}

/**
 * The TV's full-screen "this didn't load" state: one card, faded in, with
 * plain words and the one or two things the user can do about it. Replaces
 * the bare red text that used to snap in over a black screen on the
 * media-info and watch pages.
 */
function FullScreenNoticeComponent({
  title,
  message,
  actions,
  icon = "cloud-offline-outline",
}: FullScreenNoticeProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  const preferredIndex = Math.max(
    0,
    actions.findIndex((action) => action.preferred),
  );

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={styles.card}>
        <Ionicons
          name={icon}
          size={48}
          color={Colors.dark.videoDescriptionText}
        />
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <View style={styles.actions}>
          {actions.map((action, index) => (
            <FocusableButton
              key={action.label}
              title={action.label}
              onPress={action.onPress}
              hasTVPreferredFocus={index === preferredIndex}
              style={styles.button}
              focusedStyle={styles.buttonFocused}
              textStyle={styles.buttonText}
            />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: 16,
    marginTop: 28,
  },
  button: {
    backgroundColor: "#2A2A2A",
    height: 48,
    marginVertical: 0,
    width: 220,
  },
  buttonFocused: {
    borderColor: Colors.dark.outlineFocused,
    borderWidth: 2,
  },
  buttonText: {
    color: Colors.dark.whiteText,
    fontSize: 18,
  },
  card: {
    alignItems: "center",
    backgroundColor: "rgba(20, 20, 20, 0.85)",
    borderRadius: 16,
    maxWidth: 720,
    paddingHorizontal: 48,
    paddingVertical: 40,
  },
  container: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 40,
  },
  message: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 18,
    lineHeight: 26,
    marginTop: 10,
    textAlign: "center",
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 26,
    fontWeight: "600",
    marginTop: 20,
    textAlign: "center",
  },
});

export const FullScreenNotice = memo(FullScreenNoticeComponent);
