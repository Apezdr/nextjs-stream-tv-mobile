import { onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { useEffect } from "react";
import { AppState } from "react-native";

import { serverHealth } from "@/src/stores/serverHealthStore";

/**
 * Feeds the device's network state to the two things that care: React Query's
 * onlineManager (pauses queries while offline, refetches on reconnect) and the
 * server-health store (never blames the server for a dead link).
 *
 * Without this, React Query's own onlineManager never learns anything on
 * React Native — there is no `window` 'online' event — so it reports online
 * forever and `refetchOnReconnect` is dead config.
 */
export function useNetworkStatus() {
  useEffect(() => {
    const apply = (state: Network.NetworkState) => {
      // `isConnected` only. `isInternetReachable` is the OS's validated-
      // internet bit, which is false on a LAN without internet and behind
      // captive portals; keying on it would pause every query on a network
      // that reaches the server fine. Unknown counts as online.
      const online = state.isConnected !== false;
      onlineManager.setOnline(online);
      serverHealth.setOnline(online);
    };
    const refresh = () => {
      Network.getNetworkStateAsync()
        .then(apply)
        .catch(() => {});
    };

    let subscription: { remove: () => void } | null = null;
    try {
      subscription = Network.addNetworkStateListener(apply);
    } catch (error) {
      // No native listener on this platform: stay online, poll on foreground.
      if (__DEV__) console.warn("[NetworkStatus] listener unavailable", error);
    }
    refresh();

    // Listeners can be missed while the app is backgrounded; re-read on return.
    const appState = AppState.addEventListener("change", (status) => {
      if (status === "active") refresh();
    });

    return () => {
      subscription?.remove();
      appState.remove();
    };
  }, []);
}
