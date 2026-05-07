import {
  Animated,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
} from "react-native";

import OptimizedImage from "@/src/components/common/OptimizedImage";
import EpisodeList from "@/src/components/TV/MediaInfo/EpisodeList";
import EpisodesSkeleton from "@/src/components/TV/MediaInfo/EpisodesSkeleton";
import ExpandableOverview from "@/src/components/TV/MediaInfo/ExpandableOverview";
import SeasonPicker from "@/src/components/TV/MediaInfo/SeasonPicker";
import TVActionRow from "@/src/components/TV/MediaInfo/TVActionRow";
import { Colors } from "@/src/constants/Colors";
import {
  TVDeviceEpisode,
  TVDeviceMediaResponse,
} from "@/src/data/types/content.types";
import { WatchlistToggleResult } from "@/src/hooks/useWatchlistToggle";

interface MergedDisplayFields {
  seasonOverview?: string;
  showOverview?: string;
}

interface TVShowLayoutProps {
  mediaInfo: TVDeviceMediaResponse;
  watchlist: WatchlistToggleResult;
  selectedSeason: number | undefined;
  isLoadingEpisodes: boolean;
  isRefreshing: boolean;
  overviewOpacity: Animated.Value;
  mergedDisplayFields: MergedDisplayFields;
  trailerUrl?: string;
  onSeasonChange: (season: number) => void;
  onEpisodePlay: (episode: TVDeviceEpisode) => void;
  onWatchlistFocus: () => void;
  onWatchlistBlur: () => void;
  onOverviewTruncationChange: (isTruncated: boolean) => void;
}

export default function TVShowLayout({
  mediaInfo,
  watchlist,
  selectedSeason,
  isLoadingEpisodes,
  isRefreshing,
  overviewOpacity,
  mergedDisplayFields,
  trailerUrl,
  onSeasonChange,
  onEpisodePlay,
  onWatchlistFocus,
  onWatchlistBlur,
  onOverviewTruncationChange,
}: TVShowLayoutProps) {
  const hasSeasonOverview = !!mergedDisplayFields.seasonOverview;
  const hasShowOverview = !!mergedDisplayFields.showOverview;
  const areDifferent =
    hasSeasonOverview &&
    hasShowOverview &&
    mergedDisplayFields.seasonOverview !== mergedDisplayFields.showOverview;

  return (
    <View style={styles.twoColumnLayout}>
      {/* Left Column */}
      <View style={styles.leftColumn}>
        {/* Logo/Title */}
        <View style={styles.logoSection}>
          {mediaInfo.logo ? (
            <OptimizedImage
              source={mediaInfo.logo}
              contentFit="contain"
              style={{ height: 80, width: "auto" }}
              priority="high"
              width={750}
              quality={100}
            />
          ) : (
            <Text style={styles.showTitle}>{mediaInfo.title}</Text>
          )}
        </View>

        {/* Metadata Row */}
        <View style={styles.metadataRow}>
          {mediaInfo.metadata.vote_average != null &&
          typeof mediaInfo.metadata.vote_average === "number" &&
          mediaInfo.metadata.vote_average > 0 ? (
            <>
              <Text style={styles.metadataRating}>
                ★ {mediaInfo.metadata.vote_average.toFixed(1)}
              </Text>
              <Text style={styles.metadataSeparator}>•</Text>
            </>
          ) : null}
          <Text style={styles.metadataYear}>
            {mediaInfo.airDate ? new Date(mediaInfo.airDate).getFullYear() : ""}
          </Text>
          <Text style={styles.metadataSeparator}>•</Text>
          <Text style={styles.metadataSeasons}>
            {mediaInfo.totalSeasons === 1
              ? "1 Season"
              : `${mediaInfo.totalSeasons} Seasons`}
          </Text>
          <Text style={styles.metadataSeparator}>•</Text>
          {mediaInfo.metadata.rating &&
            typeof mediaInfo.metadata.rating === "string" && (
              <View style={styles.ratingBox}>
                <Text style={styles.ratingBoxText}>
                  {mediaInfo.metadata.rating}
                </Text>
              </View>
            )}
        </View>

        {/* Action Rail */}
        <TVActionRow
          watchlist={watchlist}
          trailerUrl={trailerUrl}
          onFocus={onWatchlistFocus}
          onBlur={onWatchlistBlur}
        />

        {/* Overview Section */}
        <>
          {/* Show Overview - only when both exist and are different */}
          {areDifferent && (
            <Animated.View
              style={[styles.overviewContainer, { opacity: overviewOpacity }]}
            >
              <Text style={styles.overviewSectionTitle}>Show Overview</Text>
              <ExpandableOverview
                overview={mergedDisplayFields.showOverview!}
                maxLines={1}
                onTruncationChange={onOverviewTruncationChange}
                overviewType="Show Overview"
              />
            </Animated.View>
          )}

          {/* Season Overview - when it exists and either: no show overview, or they're different */}
          {hasSeasonOverview && (!hasShowOverview || areDifferent) && (
            <Animated.View
              style={[styles.overviewContainer, { opacity: overviewOpacity }]}
            >
              <Text style={styles.overviewSectionTitle}>
                {areDifferent ? "Season Overview" : "Overview"}
              </Text>
              <ExpandableOverview
                overview={mergedDisplayFields.seasonOverview!}
                maxLines={1}
                onTruncationChange={onOverviewTruncationChange}
                overviewType={areDifferent ? "Season Overview" : "Overview"}
              />
            </Animated.View>
          )}

          {/* Show Overview - only when season overview doesn't exist OR they're the same */}
          {hasShowOverview && (!hasSeasonOverview || !areDifferent) && (
            <Animated.View
              style={[styles.overviewContainer, { opacity: overviewOpacity }]}
            >
              <Text style={styles.overviewSectionTitle}>Overview</Text>
              <ExpandableOverview
                overview={mergedDisplayFields.showOverview!}
                onTruncationChange={onOverviewTruncationChange}
                overviewType="Overview"
              />
            </Animated.View>
          )}
        </>

        {/* Season Picker */}
        <View style={styles.seasonPickerContainer}>
          <Text style={styles.seasonPickerTitle}>Seasons</Text>
          <TVFocusGuideView
            autoFocus
            trapFocusUp={false}
            trapFocusDown
            style={{ flex: 1 }}
          >
            <SeasonPicker
              navigation={mediaInfo.navigation}
              availableSeasons={mediaInfo.availableSeasons}
              currentSeason={
                selectedSeason ??
                mediaInfo.navigation?.seasons?.current ??
                mediaInfo.seasonNumber
              }
              onSeasonChange={onSeasonChange}
            />
          </TVFocusGuideView>
        </View>
      </View>

      {/* Right Column - Episodes */}
      <View style={styles.rightColumn}>
        <View style={styles.episodesTitleContainer}>
          <Text style={styles.episodesTitle}>
            Season {selectedSeason ?? mediaInfo.seasonNumber} Episodes
          </Text>
          {isRefreshing && (
            <View style={styles.refreshIndicator}>
              <Text style={styles.refreshText}>Updating...</Text>
            </View>
          )}
        </View>
        <TVFocusGuideView
          autoFocus
          trapFocusUp
          trapFocusDown
          style={{ flex: 1 }}
        >
          {isLoadingEpisodes ? (
            <EpisodesSkeleton />
          ) : (
            <EpisodeList
              episodes={mediaInfo.episodes}
              onEpisodePress={onEpisodePlay}
              fallbackBackdrop={mediaInfo.backdrop}
              fallbackBackdropBlurhash={mediaInfo.backdropBlurhash}
              logo={mediaInfo.logo}
            />
          )}
        </TVFocusGuideView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  episodesTitle: {
    color: Colors.dark.whiteText,
    fontSize: 24,
    fontWeight: "bold",
  },
  episodesTitleContainer: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  leftColumn: {
    flex: 1,
    marginRight: 40,
  },
  logoSection: {
    marginBottom: 24,
  },
  metadataRating: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "bold",
  },
  metadataRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  metadataSeasons: {
    color: "#CCCCCC",
    fontSize: 16,
  },
  metadataSeparator: {
    color: "#CCCCCC",
    fontSize: 16,
    marginHorizontal: 6,
  },
  metadataYear: {
    color: "#CCCCCC",
    fontSize: 16,
  },
  overviewContainer: {
    marginTop: 1,
  },
  overviewSectionTitle: {
    color: Colors.dark.whiteText,
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 2,
  },
  ratingBox: {
    backgroundColor: "#666666",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingBoxText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  refreshIndicator: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    position: "absolute",
    right: 0,
    top: -20,
  },
  refreshText: {
    color: "#CCCCCC",
    fontSize: 12,
    fontStyle: "italic",
  },
  rightColumn: {
    flex: 2,
  },
  seasonPickerContainer: {
    flex: 1,
    marginTop: 2,
  },
  seasonPickerTitle: {
    color: Colors.dark.whiteText,
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 0,
  },
  showTitle: {
    color: Colors.dark.whiteText,
    fontSize: 32,
    fontWeight: "bold",
  },
  twoColumnLayout: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: 30,
    paddingTop: 30,
  },
});
