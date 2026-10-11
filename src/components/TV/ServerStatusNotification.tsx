import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Colors } from "@/src/constants/Colors";
import {
  selectHealthNotice,
  useServerHealthStore,
} from "@/src/stores/serverHealthStore";

/**
 * The TV's one line about connectivity: the device is offline, the server
 * can't be reached, or the server is up without its database. Driven by the
 * server-health store, which raises the server notices only after its own
 * probe failed twice — a single failed request never shows anything.
 */
function ServerStatusNotificationComponent() {
  const notice = useServerHealthStore(selectHealthNotice);

  if (!notice) return null;

  return (
    <View style={styles.container}>
      <View style={styles.notification}>
        <Text style={styles.icon}>⚠️</Text>
        <Text style={styles.message}>{notice.message}</Text>
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
  icon: {
    color: Colors.dark.whiteText,
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
    backgroundColor: "#dc3545",
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
});

export const ServerStatusNotification = memo(ServerStatusNotificationComponent);
