import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
} from "react-native";

import TVCreditsList from "@/src/components/TV/Credits/TVCreditsList";
import { FullScreenNotice } from "@/src/components/TV/FullScreenNotice";
import { Colors } from "@/src/constants/Colors";
import { useTVAppState } from "@/src/context/TVAppStateContext";
import { useTitleCredits } from "@/src/data/hooks/queries/useCreditsQueries";
import { useCreditsViewStore } from "@/src/stores/creditsViewStore";
import { hasCredits, titleCreditsKey } from "@/src/utils/credits";

/**
 * One title's Credits & licenses, full screen (CREDITS_SIDECAR.md §6).
 *
 * Opened from a media-info screen's Credits tile, which hands the already
 * loaded `Credits` through creditsViewStore: no request. Opened from the
 * credits page, nothing was handed, so the title is fetched fresh — with
 * `season` + `episode` when the row was an episode, which is how an episode's
 * own credits are reachable on a TV without an episode screen.
 */
export default function TitleCreditsPage() {
  const { setMode } = useTVAppState();
  const params = useLocalSearchParams<{
    type: "movie" | "tv";
    id: string;
    season?: string;
    episode?: string;
    title?: string;
  }>();

  useEffect(() => {
    setMode("media-info");
  }, [setMode]);

  const season = params.season ? parseInt(params.season, 10) : undefined;
  const episode = params.episode ? parseInt(params.episode, 10) : undefined;
  const key = titleCreditsKey({
    type: params.type,
    id: params.id,
    season,
    episode,
  });

  const handed = useCreditsViewStore((state) =>
    state.key === key ? state : null,
  );
  const fetched = useTitleCredits(
    handed
      ? null
      : { mediaType: params.type, mediaId: params.id, season, episode },
  );

  const title = handed?.title ?? fetched.data?.title ?? params.title ?? "";
  const subtitle = handed?.subtitle ?? fetched.data?.subtitle;
  const credits = handed?.credits ?? fetched.data?.credits;

  const goBack = useCallback(() => {
    router.back();
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [goBack]);

  if (!handed && fetched.isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.dark.whiteText} />
      </View>
    );
  }

  if (!handed && fetched.error) {
    return (
      <View style={styles.container}>
        <FullScreenNotice
          title="Couldn't load the credits"
          message={fetched.error}
          actions={[
            {
              label: "Try again",
              onPress: async () =>
                (await fetched.refetch()).status === "success",
              preferred: true,
            },
            { label: "Go back", onPress: goBack },
          ]}
        />
      </View>
    );
  }

  if (!hasCredits(credits)) {
    return (
      <View style={styles.container}>
        <FullScreenNotice
          title="No credits to show"
          message="This title has no credits and licenses to show."
          actions={[{ label: "Go back", onPress: goBack, preferred: true }]}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <Text style={styles.heading}>Credits & licenses</Text>
      </View>
      <TVFocusGuideView autoFocus style={styles.listGuide}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <TVCreditsList credits={credits} autoFocusFirst />
        </ScrollView>
      </TVFocusGuideView>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    backgroundColor: "#141414",
    flex: 1,
  },
  header: {
    paddingBottom: 12,
    paddingHorizontal: 48,
    paddingTop: 36,
  },
  heading: {
    color: "rgba(255, 255, 255, 0.72)",
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: 1,
    marginTop: 8,
    textTransform: "uppercase",
  },
  listGuide: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
    paddingHorizontal: 48,
    paddingTop: 8,
  },
  subtitle: {
    color: "rgba(255, 255, 255, 0.72)",
    fontSize: 22,
    marginTop: 2,
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 32,
    fontWeight: "bold",
  },
});
