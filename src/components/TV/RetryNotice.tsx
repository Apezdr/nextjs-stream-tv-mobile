import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import FocusableButton from "@/src/components/basic/TV/Parts/Button";
import { Colors } from "@/src/constants/Colors";

interface RetryNoticeProps {
  message?: string;
  onRetry: () => void;
  /** A refetch is in flight; the button says so and stays focusable. */
  isRetrying?: boolean;
}

/**
 * A failed load with a way out. React Query never refetches an errored query
 * on its own, so without this a row or screen that failed once stayed failed
 * until it remounted.
 */
function RetryNoticeComponent({
  message = "Failed to load content",
  onRetry,
  isRetrying = false,
}: RetryNoticeProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      <FocusableButton
        title={isRetrying ? "Retrying…" : "Retry"}
        onPress={onRetry}
        style={styles.button}
        focusedStyle={styles.buttonFocused}
        textStyle={styles.buttonText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#2A2A2A",
    height: 44,
    marginVertical: 0,
    width: 160,
  },
  buttonFocused: {
    borderColor: Colors.dark.outlineFocused,
    borderWidth: 2,
  },
  buttonText: {
    color: Colors.dark.whiteText,
    fontSize: 16,
  },
  container: {
    alignItems: "center",
    gap: 12,
  },
  message: {
    color: "#E50914",
    fontSize: 16,
    textAlign: "center",
  },
});

export const RetryNotice = memo(RetryNoticeComponent);
