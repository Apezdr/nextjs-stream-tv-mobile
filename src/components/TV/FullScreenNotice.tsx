import { Ionicons } from "@expo/vector-icons";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  View,
} from "react-native";

import FocusableButton from "@/src/components/basic/TV/Parts/Button";
import { Colors } from "@/src/constants/Colors";

export interface FullScreenNoticeAction {
  label: string;
  /**
   * A promise gets progress inside the button: a spinner while it runs,
   * then, if it resolved to a boolean, a check or a cross for a moment.
   * Presses are ignored while it runs. A plain void handler is just a press.
   */
  onPress: () => void | Promise<void | boolean>;
  /** Takes initial focus. Defaults to the first action. */
  preferred?: boolean;
}

interface FullScreenNoticeProps {
  title: string;
  message?: string | null;
  actions: FullScreenNoticeAction[];
  icon?: keyof typeof Ionicons.glyphMap;
}

type ActionStatus = "idle" | "pending" | "success" | "failure";

/** How long the check or cross stays before the button is plain again. */
const RESULT_MS = 2500;

/**
 * The TV's full-screen "this didn't load" state: one card, faded in, with
 * plain words and the one or two things the user can do about it. Replaces
 * the bare red text that used to snap in over a black screen on the
 * media-info and watch pages. A retry reports inside its button rather than
 * by swapping the whole screen out and back.
 */
function FullScreenNoticeComponent({
  title,
  message,
  actions,
  icon = "cloud-offline-outline",
}: FullScreenNoticeProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [statuses, setStatuses] = useState<Record<number, ActionStatus>>({});
  const mounted = useRef(true);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
    return () => {
      mounted.current = false;
    };
  }, [opacity]);

  const setStatus = useCallback((index: number, status: ActionStatus) => {
    if (mounted.current) setStatuses((s) => ({ ...s, [index]: status }));
  }, []);

  const run = useCallback(
    async (index: number, action: FullScreenNoticeAction) => {
      if (statuses[index] === "pending") return;
      const result = action.onPress();
      if (!(result instanceof Promise)) return;
      setStatus(index, "pending");
      let outcome: void | boolean;
      try {
        outcome = await result;
      } catch {
        outcome = false;
      }
      if (typeof outcome !== "boolean") {
        setStatus(index, "idle");
        return;
      }
      setStatus(index, outcome ? "success" : "failure");
      setTimeout(() => setStatus(index, "idle"), RESULT_MS);
    },
    [statuses, setStatus],
  );

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
              onPress={() => void run(index, action)}
              hasTVPreferredFocus={index === preferredIndex}
              style={styles.button}
              focusedStyle={styles.buttonFocused}
              textStyle={styles.buttonText}
              accessory={statusAccessory(statuses[index] ?? "idle")}
            />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

function statusAccessory(status: ActionStatus): React.ReactNode {
  switch (status) {
    case "pending":
      return <ActivityIndicator size="small" color={Colors.dark.whiteText} />;
    case "success":
      return <Text style={styles.resultOk}>✓</Text>;
    case "failure":
      return <Text style={styles.resultFailed}>✕</Text>;
    default:
      return null;
  }
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
  resultFailed: {
    color: "#FF6B6B",
    fontSize: 20,
    fontWeight: "700",
  },
  resultOk: {
    color: "#4CD964",
    fontSize: 20,
    fontWeight: "700",
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
