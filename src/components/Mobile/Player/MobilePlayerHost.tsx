import { StyleSheet, View } from "react-native";

import MobileWatchSession from "./MobileWatchSession";

import { useMobilePlayerStore } from "@/src/stores/mobilePlayerStore";

/**
 * The player's home above the mobile navigator. Rendered once in the
 * (mobile) layout; it draws the current playback session, if any, over
 * every screen so the video survives browsing. Touches outside the session's
 * own views (the mini player's surroundings) fall through to the screens.
 *
 * Deliberately a plain View, not a GestureHandlerRootView: the gesture
 * library's root view ignores `pointerEvents` on Android (its view manager
 * has no setter for it), so a full-screen one here swallowed every touch
 * around the mini player. The session puts gesture roots only inside the
 * views that need them.
 *
 * The session is keyed: a new title or episode is a fresh mount, so the
 * playback hooks keep their one-title-per-mount contract.
 */
export default function MobilePlayerHost() {
  const session = useMobilePlayerStore((s) => s.session);
  if (!session) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <MobileWatchSession key={session.key} session={session} />
    </View>
  );
}
