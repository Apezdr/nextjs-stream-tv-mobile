import { StyleSheet, Text, View } from "react-native";

import { Colors } from "@/src/constants/Colors";

interface SessionExpiredNoticeProps {
  /** Whether the last sign-out was forced by the server. */
  visible: boolean;
  isTVPlatform?: boolean;
}

/**
 * Explains an involuntary sign-out on the login screens.
 *
 * Deliberately not an Alert: this renders on TV, where a modal would steal
 * focus from the QR code and need a remote press to dismiss. It is passive
 * text that disappears once the user signs in again.
 */
export default function SessionExpiredNotice({
  visible,
  isTVPlatform = false,
}: SessionExpiredNoticeProps) {
  if (!visible) return null;

  return (
    <View style={[styles.container, isTVPlatform && styles.containerTV]}>
      <Text style={[styles.text, isTVPlatform && styles.textTV]}>
        Your session ended on this device. Please sign in again to continue.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
    backgroundColor: "rgba(229, 57, 53, 0.12)",
    borderColor: "rgba(229, 57, 53, 0.45)",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    maxWidth: 520,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  containerTV: {
    marginBottom: 24,
    maxWidth: 720,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  text: {
    color: Colors.dark.whiteText,
    fontSize: 14,
    textAlign: "center",
  },
  textTV: {
    fontSize: 20,
  },
});
