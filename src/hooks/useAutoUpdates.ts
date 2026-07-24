import * as Updates from "expo-updates";
import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

/**
 * Checks for a new EAS Update on mount and every time the app returns to the
 * foreground, downloading and immediately restarting into it when found.
 * No-op when expo-updates isn't active (Expo Go, dev builds, local dev).
 */
export function useAutoUpdates() {
  const isCheckingRef = useRef(false);

  useEffect(() => {
    if (!Updates.isEnabled) return;

    const checkAndApplyUpdate = async () => {
      if (isCheckingRef.current) return;
      isCheckingRef.current = true;

      try {
        const checkResult = await Updates.checkForUpdateAsync();
        if (checkResult.isAvailable) {
          console.log("[AutoUpdate] Update available, downloading...");
          await Updates.fetchUpdateAsync();
          console.log("[AutoUpdate] Update downloaded, reloading...");
          await Updates.reloadAsync();
        }
      } catch (error) {
        console.error("[AutoUpdate] Failed to check/apply update:", error);
      } finally {
        isCheckingRef.current = false;
      }
    };

    // Covers app launch
    checkAndApplyUpdate();

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        checkAndApplyUpdate();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, []);
}
