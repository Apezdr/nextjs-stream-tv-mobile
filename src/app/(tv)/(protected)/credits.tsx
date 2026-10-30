import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
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
import { useCreditsCatalog } from "@/src/data/hooks/queries/useCreditsQueries";
import type { CreditedTitle } from "@/src/data/types/content.types";
import { hasCredits } from "@/src/utils/credits";
import {
  navigationHelper,
  type TitleCreditsNavigationParams,
} from "@/src/utils/navigationHelper";

/**
 * The Credits & licenses page behind the Settings menu item
 * (CREDITS_SIDECAR.md §7): the library's own credits, then every credited
 * title this user may see as a row that opens the same credits view the
 * Credits tile opens. The list is an index, not more credits: no title's
 * notices are repeated here.
 *
 * A failed refresh keeps what was on screen and offers a retry; the page
 * never shows an empty "no credits" state over an error.
 */

const LABEL_COLOR = "rgba(255, 255, 255, 0.72)";

export default function CreditsPage() {
  const { setMode } = useTVAppState();
  const { data, isLoading, error, refetch } = useCreditsCatalog();

  useEffect(() => {
    setMode("media-info");
  }, [setMode]);

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

  // Back from a title's credits lands focus on the row that opened it.
  const rowRefs = useRef(new Map<string, View | null>());
  const restoreRowKeyRef = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      const rowKey = restoreRowKeyRef.current;
      if (!rowKey) return;
      restoreRowKeyRef.current = null;
      const timer = setTimeout(() => {
        rowRefs.current.get(rowKey)?.requestTVFocus();
      }, 50);
      return () => clearTimeout(timer);
    }, []),
  );

  const openTitle = useCallback(
    (rowKey: string, target: TitleCreditsNavigationParams) => {
      restoreRowKeyRef.current = rowKey;
      navigationHelper.navigateToTitleCredits(target);
    },
    [],
  );

  const retry = useCallback(
    async () => (await refetch()).status === "success",
    [refetch],
  );

  if (isLoading && !data) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.dark.whiteText} />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.container}>
        <FullScreenNotice
          title="Couldn't load the credits"
          message={error}
          actions={[
            { label: "Try again", onPress: retry, preferred: true },
            { label: "Go back", onPress: goBack },
          ]}
        />
      </View>
    );
  }

  const library =
    data?.library && hasCredits(data.library) ? data.library : null;
  const titles = data?.titles ?? [];
  const hasAnything = !!library || titles.length > 0;
  let firstRow = !library;

  const rowRef = (rowKey: string) => (node: View | null) => {
    rowRefs.current.set(rowKey, node);
  };

  return (
    <View style={styles.container}>
      <TVFocusGuideView autoFocus style={styles.listGuide}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Credits & licenses</Text>

          {error ? (
            <Pressable
              focusable
              onPress={() => void refetch()}
              style={({ focused }) => [
                styles.retryRow,
                focused && styles.rowFocused,
              ]}
            >
              <Text style={styles.retryText}>
                Couldn't refresh: {error} · Select to try again
              </Text>
            </Pressable>
          ) : null}

          {library ? (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Library</Text>
              <Text style={styles.sectionNote}>
                Shared artwork, such as the poster collage.
              </Text>
              <TVCreditsList credits={library} autoFocusFirst />
            </View>
          ) : null}

          {titles.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Titles with credits</Text>
              {titles.map((item) => {
                const rows = titleRows(item);
                return rows.map((row) => {
                  if (!row.target) {
                    // A show without credits of its own: a label, with its
                    // episodes as the links beneath it.
                    return (
                      <View key={row.key} style={styles.labelRow}>
                        <Text style={styles.rowTitle}>{row.label}</Text>
                        <Text style={styles.rowMeta}>{row.meta}</Text>
                      </View>
                    );
                  }
                  const preferred = firstRow;
                  firstRow = false;
                  const target = row.target;
                  return (
                    <Pressable
                      key={row.key}
                      ref={rowRef(row.key)}
                      focusable
                      hasTVPreferredFocus={preferred}
                      onPress={() => openTitle(row.key, target)}
                      style={({ focused }) => [
                        styles.row,
                        row.indented && styles.rowIndented,
                        focused && styles.rowFocused,
                      ]}
                    >
                      <Text style={styles.rowTitle}>{row.label}</Text>
                      <Text style={styles.rowMeta}>{row.meta}</Text>
                    </Pressable>
                  );
                });
              })}
            </View>
          ) : null}

          {!hasAnything ? (
            <Text style={styles.empty}>There are no credits to show yet.</Text>
          ) : null}
        </ScrollView>
      </TVFocusGuideView>
    </View>
  );
}

interface TitleRow {
  key: string;
  label: string;
  meta: string;
  indented?: boolean;
  /** Absent for a label row (a show whose episodes carry the credits). */
  target?: TitleCreditsNavigationParams;
}

function titleRows(item: CreditedTitle): TitleRow[] {
  if (item.type === "movie") {
    return [
      {
        key: `movie:${item.id}`,
        label: item.title,
        meta: "Movie",
        target: { type: "movie", id: item.id, title: item.title },
      },
    ];
  }

  const show: TitleRow = {
    key: `tv:${item.id}`,
    label: item.title,
    meta: "Show",
    target: item.hasCredits
      ? { type: "tv", id: item.id, title: item.title }
      : undefined,
  };
  const episodes = (item.episodes ?? []).map((episode): TitleRow => {
    const code = `S${episode.seasonNumber} E${episode.episodeNumber}`;
    return {
      key: `tv:${item.id}:s${episode.seasonNumber}e${episode.episodeNumber}`,
      label: episode.title?.trim() ? `${code} · ${episode.title}` : code,
      meta: "Episode",
      indented: true,
      target: {
        type: "tv",
        id: item.id,
        season: episode.seasonNumber,
        episode: episode.episodeNumber,
        title: item.title,
      },
    };
  });
  return [show, ...episodes];
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
  empty: {
    color: LABEL_COLOR,
    fontSize: 22,
    marginTop: 12,
  },
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    maxWidth: 860,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  listGuide: {
    flex: 1,
  },
  retryRow: {
    backgroundColor: "rgba(220, 53, 69, 0.18)",
    borderColor: "transparent",
    borderRadius: 10,
    borderWidth: 2,
    marginBottom: 20,
    maxWidth: 860,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  retryText: {
    color: Colors.dark.whiteText,
    fontSize: 20,
  },
  row: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "transparent",
    borderRadius: 10,
    borderWidth: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    maxWidth: 860,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  rowFocused: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderColor: "#FFFFFF",
  },
  rowIndented: {
    marginLeft: 32,
  },
  rowMeta: {
    color: LABEL_COLOR,
    fontSize: 20,
    marginLeft: 16,
  },
  rowTitle: {
    color: Colors.dark.whiteText,
    flexShrink: 1,
    fontSize: 24,
  },
  scrollContent: {
    paddingBottom: 48,
    paddingHorizontal: 48,
    paddingTop: 36,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeading: {
    color: Colors.dark.whiteText,
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 4,
  },
  sectionNote: {
    color: LABEL_COLOR,
    fontSize: 20,
    marginBottom: 14,
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 20,
  },
});
