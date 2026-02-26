import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";

import EpisodeProgressBar from "./EpisodeProgressBar";

import OptimizedImage from "@/src/components/common/OptimizedImage";
import { Colors } from "@/src/constants/Colors";
import { TVDeviceEpisode } from "@/src/data/types/content.types";

interface EpisodeListProps {
  episodes: TVDeviceEpisode[];
  onEpisodePress: (episode: TVDeviceEpisode) => void;
  fallbackBackdrop?: string;
  fallbackBackdropBlurhash?: string;
  logo?: string;
}

export default function EpisodeList({
  episodes,
  onEpisodePress,
  fallbackBackdrop,
  fallbackBackdropBlurhash,
  logo,
}: EpisodeListProps) {
  const formatDuration = (milliseconds: number): string => {
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {episodes.map((episode) => (
        <Pressable
          key={episode.episodeNumber}
          focusable
          style={({ focused }) => [
            styles.episodeItem,
            focused && styles.episodeItemFocused,
          ]}
          onPress={() => onEpisodePress(episode)}
        >
          <View style={styles.episodeContent}>
            {/* Thumbnail with episode number overlay */}
            <View style={styles.thumbnailContainer}>
              <OptimizedImage
                source={{
                  uri:
                    episode.thumbnail && episode.thumbnail.trim() !== ""
                      ? episode.thumbnail
                      : (fallbackBackdrop ?? ""),
                }}
                placeholder={
                  episode.thumbnailBlurhash || fallbackBackdropBlurhash
                    ? {
                        uri: `data:image/png;base64,${
                          episode.thumbnailBlurhash || fallbackBackdropBlurhash
                        }`,
                      }
                    : undefined
                }
                placeholderContentFit="cover"
                style={styles.thumbnail}
                contentFit="cover"
                transition={1000}
                width={640}
                quality={75}
              />
              <View style={styles.episodeNumberOverlay}>
                <Text style={styles.episodeNumberText}>
                  Episode {episode.episodeNumber}
                </Text>
              </View>
              {episode.hdr && episode.hdr !== "10-bit SDR (BT.709)" && (
                <View style={styles.hdrBadge}>
                  <Text style={styles.hdrText}>HDR</Text>
                </View>
              )}
              {!episode.title?.trim() && !!logo && (
                <View style={styles.logoOverlay}>
                  <OptimizedImage
                    source={logo}
                    contentFit="contain"
                    style={styles.logoOverlayImage}
                    priority="high"
                    width={320}
                    quality={100}
                  />
                </View>
              )}
            </View>

            {/* Episode details */}
            <View style={styles.episodeDetails}>
              <Text style={styles.episodeTitle} numberOfLines={1}>
                {episode.title}
              </Text>
              <Text style={styles.episodeOverview} numberOfLines={2}>
                {episode.description}
              </Text>
              <EpisodeProgressBar
                watchHistory={episode.watchHistory}
                duration={episode.duration}
              />
              <View style={styles.durationRow}>
                <Text style={styles.episodeDuration}>
                  ({formatDuration(episode.duration)})
                </Text>
                {Boolean(
                  episode.watchHistory?.playbackTime &&
                  episode.duration > 0 &&
                  (episode.watchHistory.playbackTime /
                    (episode.duration / 1000)) *
                    100 >=
                    95,
                ) && <Text style={styles.watchedLabel}>Watched</Text>}
              </View>
            </View>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingVertical: 8,
  },
  durationRow: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 4,
  },
  episodeContent: {
    alignItems: "flex-start",
    flexDirection: "row",
  },
  episodeDetails: {
    flex: 1,
    justifyContent: "flex-start",
  },
  episodeDuration: {
    color: "#999999",
    fontSize: 14,
    fontStyle: "italic",
  },
  episodeItem: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    marginVertical: 6,
    padding: 12,
  },
  episodeItemFocused: {
    backgroundColor: Colors.dark.tint,
    borderColor: "#FFFFFF",
    borderWidth: 2,
  },
  episodeNumberOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: 4,
    bottom: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: "absolute",
  },
  episodeNumberText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  episodeOverview: {
    color: "#CCCCCC",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  episodeTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  hdrBadge: {
    backgroundColor: "#FFD700",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: "absolute",
    right: 6,
    top: 6,
  },
  hdrText: {
    color: "#000000",
    fontSize: 10,
    fontWeight: "bold",
  },
  logoOverlay: {
    bottom: 6,
    maxHeight: 40,
    maxWidth: 120,
    position: "absolute",
    right: 6,
  },
  logoOverlayImage: {
    height: 40,
    opacity: 0.95,
    width: 120,
  },
  thumbnail: {
    borderRadius: 8,
    height: 90,
    width: 160,
  },
  thumbnailContainer: {
    marginRight: 16,
    position: "relative",
  },
  watchedLabel: {
    color: "#46D369",
    fontSize: 12,
    fontStyle: "italic",
    fontWeight: "600",
    marginLeft: 8,
  },
});
