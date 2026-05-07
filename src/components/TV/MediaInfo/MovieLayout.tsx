import { StyleSheet, Text, View } from "react-native";

import OptimizedImage from "@/src/components/common/OptimizedImage";
import ExpandableOverview from "@/src/components/TV/MediaInfo/ExpandableOverview";
import MovieActionRow from "@/src/components/TV/MediaInfo/MovieActionRow";
import WatchProgressBar from "@/src/components/TV/MediaInfo/WatchProgressBar";
import { Colors } from "@/src/constants/Colors";
import { TVDeviceMediaResponse } from "@/src/data/types/content.types";
import { WatchlistToggleResult } from "@/src/hooks/useWatchlistToggle";

function formatTimeFromMs(ms?: number | null): string {
  if (!ms) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function parseResolution(input: string): string | null {
  if (!input) return null;

  const resolutionPatterns = [
    { pattern: /3840[x×]2160|4k|uhd/i, label: "4K" },
    { pattern: /2560[x×]1440|1440p/i, label: "1440p" },
    { pattern: /1920[x×]1080|1080p|fhd/i, label: "1080p" },
    { pattern: /1280[x×]720|720p|hd/i, label: "720p" },
    { pattern: /854[x×]480|480p/i, label: "480p" },
    { pattern: /640[x×]360|360p/i, label: "360p" },
  ];

  for (const { pattern, label } of resolutionPatterns) {
    if (pattern.test(input)) return label;
  }

  const dimensionMatch = input.match(/(\d{3,4})[x×](\d{3,4})/);
  if (dimensionMatch) {
    const width = parseInt(dimensionMatch[1]);
    if (width >= 3840) return "4K";
    if (width >= 2560) return "1440p";
    if (width >= 1920) return "1080p";
    if (width >= 1280) return "720p";
    if (width >= 854) return "480p";
    if (width >= 640) return "360p";
    return `${width}p`;
  }

  return null;
}

function formatResolution(dimensions?: string): string | null {
  if (dimensions) return parseResolution(dimensions);
  return null;
}

function formatHDR(hdr?: string | boolean): string | null {
  if (!hdr) return null;

  if (typeof hdr === "string") {
    if (hdr.toLowerCase().includes("hdr10+")) return "HDR10+";
    if (hdr.toLowerCase().includes("hdr10")) return "HDR10";
    if (hdr.toLowerCase().includes("dolby vision")) return "Dolby Vision";
    if (hdr.toLowerCase().includes("hdr")) return "HDR";

    if (hdr.trim().length > 0 && !hdr.toLowerCase().includes("sdr")) {
      return hdr.trim();
    }
  }

  return null;
}

interface MergedDisplayFields {
  seasonOverview?: string;
  showOverview?: string;
}

interface MovieLayoutProps {
  mediaInfo: TVDeviceMediaResponse;
  watchlist: WatchlistToggleResult;
  isRefreshing: boolean;
  mergedDisplayFields: MergedDisplayFields;
  onPlay: () => void;
  onWatchlistFocus: () => void;
  onWatchlistBlur: () => void;
  onOverviewTruncationChange: (isTruncated: boolean) => void;
}

export default function MovieLayout({
  mediaInfo,
  watchlist,
  isRefreshing,
  mergedDisplayFields,
  onPlay,
  onWatchlistFocus,
  onWatchlistBlur,
  onOverviewTruncationChange,
}: MovieLayoutProps) {
  const resolution = formatResolution((mediaInfo as any).dimensions);
  const hdr = formatHDR((mediaInfo as any).hdr);
  const qualityParts = [resolution, hdr].filter(Boolean);
  const quality = qualityParts.join(" ");

  return (
    <View style={styles.movieLayout}>
      <View style={styles.movieColumn}>
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
            {mediaInfo.metadata.releaseDate
              ? new Date(mediaInfo.metadata.releaseDate).getFullYear()
              : ""}
          </Text>
          <Text style={styles.metadataSeparator}>•</Text>
          <Text style={styles.metadataType}>Movie</Text>
          <Text style={styles.metadataSeparator}>•</Text>
          {quality ? (
            <>
              <Text style={styles.metadataResolution}>{quality}</Text>
              <Text style={styles.metadataSeparator}>•</Text>
            </>
          ) : null}
          {(!mediaInfo.watchHistory?.playbackTime ||
            (mediaInfo.watchHistory?.playbackTime ?? 0) < 10) &&
          mediaInfo.duration ? (
            <>
              <Text style={styles.metadataDuration}>
                {formatTimeFromMs(mediaInfo.duration)}
              </Text>
              <Text style={styles.metadataSeparator}>•</Text>
            </>
          ) : null}
          {mediaInfo.metadata.rating &&
            typeof mediaInfo.metadata.rating === "string" && (
              <View style={styles.ratingBox}>
                <Text style={styles.ratingBoxText}>
                  {mediaInfo.metadata.rating}
                </Text>
              </View>
            )}
        </View>

        {/* Watch Progress Bar */}
        <View style={styles.watchProgressContainer}>
          <WatchProgressBar
            watchHistory={mediaInfo.watchHistory}
            duration={mediaInfo?.duration}
          />
          {isRefreshing && (
            <View style={styles.refreshIndicator}>
              <Text style={styles.refreshText}>Updating...</Text>
            </View>
          )}
        </View>

        {/* Overview */}
        {mergedDisplayFields.seasonOverview ||
        mergedDisplayFields.showOverview ? (
          <View style={styles.overviewContainer}>
            <ExpandableOverview
              overview={
                (mergedDisplayFields.seasonOverview ||
                  mergedDisplayFields.showOverview)!
              }
              onTruncationChange={onOverviewTruncationChange}
            />
          </View>
        ) : null}

        {/* Action Row */}
        <MovieActionRow
          onPlay={onPlay}
          watchlist={watchlist}
          trailerUrl={mediaInfo.metadata.trailer_url}
          onWatchlistFocus={onWatchlistFocus}
          onWatchlistBlur={onWatchlistBlur}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  movieLayout: {
    flex: 1,
    padding: 40,
  },
  movieColumn: {
    flex: 1,
    maxWidth: 600,
  },
  logoSection: {
    marginBottom: 24,
  },
  showTitle: {
    color: Colors.dark.whiteText,
    fontSize: 32,
    fontWeight: "bold",
  },
  metadataRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  metadataRating: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "bold",
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
  metadataType: {
    color: "#CCCCCC",
    fontSize: 16,
  },
  metadataDuration: {
    color: "#CCCCCC",
    fontSize: 16,
    marginHorizontal: 6,
  },
  metadataResolution: {
    color: "#00D4FF",
    fontSize: 16,
    fontWeight: "600",
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
  watchProgressContainer: {
    position: "relative",
  },
  overviewContainer: {
    marginTop: 4,
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
});
