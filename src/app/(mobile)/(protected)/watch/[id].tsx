import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { useMobilePlayerStore } from "@/src/stores/mobilePlayerStore";

function parseNumericParam(value: string | undefined): number | undefined {
  if (!value || value === "") return undefined;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * The mobile watch route no longer hosts playback: the player lives above
 * the navigator (MobilePlayerHost) so it survives browsing. This screen
 * remains for links that still name the route — it opens the title in the
 * player and steps out of the way.
 */
export default function MobileWatchRedirect() {
  const params = useLocalSearchParams<{
    id: string;
    type: "tv" | "movie";
    season?: string;
    episode?: string;
    backdrop?: string;
    backdropBlurhash?: string;
    restart?: string;
  }>();
  const router = useRouter();

  useEffect(() => {
    if (params.id && params.type) {
      useMobilePlayerStore.getState().open({
        id: params.id,
        type: params.type === "tv" ? "tv" : "movie",
        season: parseNumericParam(params.season),
        episode: parseNumericParam(params.episode),
        backdrop: params.backdrop,
        backdropBlurhash: params.backdropBlurhash,
        restart: params.restart === "true",
      });
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(mobile)/(protected)/(tabs)");
    }
    // Once, on mount: the params are the link's and never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000000",
    flex: 1,
  },
});
