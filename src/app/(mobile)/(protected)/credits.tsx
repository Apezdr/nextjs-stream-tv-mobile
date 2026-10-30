import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CreditsSection from "@/src/components/Mobile/Credits/CreditsSection";
import { Colors } from "@/src/constants/Colors";
import { useCreditsCatalog } from "@/src/data/hooks/queries/useCreditsQueries";
import type { CreditedTitle } from "@/src/data/types/content.types";
import { hasCredits } from "@/src/utils/credits";
import { navigationHelper } from "@/src/utils/navigationHelper";

/**
 * The Credits & licenses page behind the Profile row (CREDITS_SIDECAR.md
 * §7): the library's own credits, then every credited title this user may
 * see. A movie or show links to its info screen scrolled to its credits; an
 * episode to its episode screen. The list is an index, not more credits.
 *
 * Pull to refresh asks again. A failed refresh keeps what is on screen and
 * shows a retry; the page never shows an empty "no credits" state over an
 * error.
 */
export default function MobileCreditsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isRefreshing, error, refetch } = useCreditsCatalog();

  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const library =
    data?.library && hasCredits(data.library) ? data.library : null;
  const titles = data?.titles ?? [];
  const hasAnything = !!library || titles.length > 0;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.dark.whiteText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Credits & licenses
        </Text>
      </View>

      {isLoading && !data ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.whiteText} />
        </View>
      ) : error && !data ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.dark.whiteText}
            />
          }
        >
          {error ? (
            <Pressable
              style={styles.retryBanner}
              onPress={handleRefresh}
              accessibilityRole="button"
            >
              <Text style={styles.retryBannerText}>
                Couldn't refresh: {error} Tap to try again.
              </Text>
            </Pressable>
          ) : null}

          {library ? (
            <CreditsSection
              credits={library}
              heading="Library"
              description="Shared artwork, such as the poster collage."
            />
          ) : null}

          {titles.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionHeading} accessibilityRole="header">
                Titles with credits
              </Text>
              {titles.map((item) => (
                <TitleRows key={`${item.type}-${item.id}`} item={item} />
              ))}
            </View>
          ) : null}

          {!hasAnything ? (
            <Text style={styles.empty}>There are no credits to show yet.</Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function TitleRows({ item }: { item: CreditedTitle }) {
  if (item.type === "movie") {
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() =>
          navigationHelper.navigateToTitleCredits({
            type: "movie",
            id: item.id,
          })
        }
        accessibilityRole="button"
      >
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{item.title}</Text>
          <Text style={styles.rowMeta}>Movie</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#8C8C8C" />
      </TouchableOpacity>
    );
  }

  return (
    <>
      {item.hasCredits ? (
        <TouchableOpacity
          style={styles.row}
          onPress={() =>
            navigationHelper.navigateToTitleCredits({ type: "tv", id: item.id })
          }
          accessibilityRole="button"
        >
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.rowMeta}>Show</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#8C8C8C" />
        </TouchableOpacity>
      ) : (
        // A show without credits of its own: a label, with its episodes as
        // the links beneath it.
        <View style={styles.labelRow}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.rowMeta}>Show</Text>
          </View>
        </View>
      )}
      {(item.episodes ?? []).map((episode) => {
        const code = `S${episode.seasonNumber} E${episode.episodeNumber}`;
        return (
          <TouchableOpacity
            key={`${item.id}-s${episode.seasonNumber}e${episode.episodeNumber}`}
            style={[styles.row, styles.rowIndented]}
            onPress={() =>
              navigationHelper.navigateToTitleCredits({
                type: "tv",
                id: item.id,
                season: episode.seasonNumber,
                episode: episode.episodeNumber,
              })
            }
            accessibilityRole="button"
          >
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>
                {episode.title?.trim() ? `${code} · ${episode.title}` : code}
              </Text>
              <Text style={styles.rowMeta}>Episode</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8C8C8C" />
          </TouchableOpacity>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 32,
  },
  container: {
    backgroundColor: "#141414",
    flex: 1,
  },
  content: {
    flex: 1,
  },
  empty: {
    color: "#8C8C8C",
    fontSize: 15,
    marginTop: 8,
  },
  errorText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 15,
    marginBottom: 16,
    textAlign: "center",
  },
  header: {
    alignItems: "center",
    borderBottomColor: Colors.dark.outline,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBackButton: {
    marginRight: 8,
    padding: 8,
  },
  headerTitle: {
    color: Colors.dark.whiteText,
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
  },
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryBanner: {
    backgroundColor: "rgba(220, 53, 69, 0.18)",
    borderRadius: 8,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryBannerText: {
    color: Colors.dark.whiteText,
    fontSize: 14,
  },
  retryButton: {
    backgroundColor: Colors.dark.brandPrimary,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: Colors.dark.whiteText,
    fontSize: 16,
    fontWeight: "600",
  },
  row: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowIndented: {
    marginLeft: 20,
  },
  rowMeta: {
    color: "#8C8C8C",
    fontSize: 13,
    marginTop: 2,
  },
  rowText: {
    flexShrink: 1,
    paddingRight: 12,
  },
  rowTitle: {
    color: Colors.dark.whiteText,
    fontSize: 16,
    fontWeight: "500",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeading: {
    color: Colors.dark.whiteText,
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
  },
});
