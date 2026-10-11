import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/src/constants/Colors";
import {
  selectHealthNotice,
  useServerHealthStore,
} from "@/src/stores/serverHealthStore";

/**
 * Mobile shows the device's own network state and nothing about the server:
 * a dead link is the user's to fix, a dead server is not.
 */
function OfflineNoticeComponent() {
  const notice = useServerHealthStore(selectHealthNotice);
  const insets = useSafeAreaInsets();

  if (notice?.kind !== "offline") return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.container, { top: insets.top + 8 }]}
    >
      <View style={styles.notice}>
        <Text style={styles.message}>{notice.message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    left: 16,
    position: "absolute",
    right: 16,
    zIndex: 1000,
  },
  message: {
    color: Colors.dark.whiteText,
    fontSize: 14,
    fontWeight: "500",
  },
  notice: {
    backgroundColor: "#dc3545",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});

export const OfflineNotice = memo(OfflineNoticeComponent);
