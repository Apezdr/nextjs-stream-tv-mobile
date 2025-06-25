import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";

import { Colors } from "@/src/constants/Colors";
import { useAuth } from "@/src/providers/AuthProvider";

export function ServerStatusNotification() {
  const { isServerDown, serverStatusMessage } = useAuth();

  // Track state changes with useEffect
  useEffect(() => {
    console.log("[ServerStatusNotification] State changed:", {
      isServerDown,
      serverStatusMessage,
      shouldShow: isServerDown || !!serverStatusMessage,
    });
  }, [isServerDown, serverStatusMessage]);

  // Debug logging on every render
  console.log("[ServerStatusNotification] Render:", {
    isServerDown,
    serverStatusMessage,
    shouldShow: isServerDown || !!serverStatusMessage,
  });

  // Don't render anything if there are no issues
  if (!isServerDown && !serverStatusMessage) {
    console.log(
      "[ServerStatusNotification] Not rendering - no issues detected",
    );
    return null;
  }

  console.log("[ServerStatusNotification] Rendering notification");

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.notification,
          isServerDown ? styles.errorNotification : styles.warningNotification,
        ]}
      >
        <Text
          style={[
            styles.icon,
            isServerDown ? styles.errorIcon : styles.warningIcon,
          ]}
        >
          {isServerDown ? "⚠️" : "ℹ️"}
        </Text>
        <Text style={styles.message}>
          {serverStatusMessage || "Server status unknown"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    left: 20,
    pointerEvents: "none",
    position: "absolute",
    right: 20,
    top: 20,
    zIndex: 1000, // Allow touches to pass through
  },
  errorIcon: {
    color: Colors.dark.whiteText,
  },
  errorNotification: {
    backgroundColor: "#dc3545",
  },
  icon: {
    fontSize: 20,
    marginRight: 12,
  },
  message: {
    color: Colors.dark.whiteText,
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },
  notification: {
    alignItems: "center",
    borderRadius: 8,
    elevation: 5,
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  warningIcon: {
    color: Colors.dark.whiteText,
  },
  warningNotification: {
    backgroundColor: "#fd7e14",
  },
});
