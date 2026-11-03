import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import OptimizedImage from "@/src/components/common/OptimizedImage";
import { MobileActionSheet } from "@/src/components/Mobile/ActionSheet";
import { ActionSheetAction } from "@/src/components/Mobile/ActionSheet/MobileActionSheet";
import { OptionAvailability } from "@/src/components/Mobile/Video/MobileVideoControls";
import { Colors } from "@/src/constants/Colors";
import { useTVMediaDetails } from "@/src/data/hooks/useContent";
import {
  MediaDetailsResponse,
  TVDeviceEpisode,
} from "@/src/data/types/content.types";
import { MobilePlayerSession } from "@/src/stores/mobilePlayerStore";
import {
  isWatchCompleted,
  watchProgressPercent,
} from "@/src/utils/watchProgress";

interface MobileWatchDetailsProps {
  session: MobilePlayerSession;
  videoData: MediaDetailsResponse | null;
  options: OptionAvailability;
  qualityBadge: string | null;
  onOpenCaptions: () => void;
  onOpenAudio: () => void;
  onOpenQuality: () => void;
  onSelectEpisode: (season: number, episode: number, restart?: boolean) => void;
  onOpenEpisodeInfo: (season: number, episode: number) => void;
  onOpenInfo: () => void;
}

const THUMB_WIDTH = 128;
const THUMB_HEIGHT = 72;
const ROW_VERTICAL_PADDING = 8;
const ROW_HEIGHT = THUMB_HEIGHT + 2 * ROW_VERTICAL_PADDING;
const SYNOPSIS_LINES = 3;

function formatMinutes(ms?: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function yearOf(date?: string | null): string | null {
  if (!date) return null;
  const match = /^(\d{4})/.exec(date);
  return match ? match[1] : null;
}

function placeholderSource(hash?: string | null) {
  if (!hash) return undefined;
  return {
    uri: hash.startsWith("data:") ? hash : `data:image/png;base64,${hash}`,
  };
}

interface EpisodeRowProps {
  episode: TVDeviceEpisode;
  isCurrent: boolean;
  fallbackThumbnail?: string;
  fallbackBlurhash?: string;
  onPress: (episode: TVDeviceEpisode) => void;
  onMore: (episode: TVDeviceEpisode) => void;
}

const EpisodeRow = memo(
  ({
    episode,
    isCurrent,
    fallbackThumbnail,
    fallbackBlurhash,
    onPress,
    onMore,
  }: EpisodeRowProps) => {
    const percent = watchProgressPercent(
      episode.watchHistory,
      episode.duration,
    );
    const completed = isWatchCompleted(episode.watchHistory, episode.duration);
    const thumbnail =
      episode.thumbnail && episode.thumbnail.trim() !== ""
        ? episode.thumbnail
        : (fallbackThumbnail ?? "");
    const minutes = formatMinutes(episode.duration);
    return (
      <Pressable
        style={({ pressed }) => [
          styles.episodeRow,
          isCurrent && styles.episodeRowCurrent,
          pressed && !isCurrent && styles.episodeRowPressed,
        ]}
        onPress={() => onPress(episode)}
        accessibilityRole="button"
        accessibilityLabel={`Episode ${episode.episodeNumber}${
          episode.title ? `, ${episode.title}` : ""
        }${isCurrent ? ", now playing" : ""}`}
      >
        <View style={styles.thumbnail}>
          <OptimizedImage
            source={{ uri: thumbnail }}
            placeholder={placeholderSource(
              episode.thumbnailBlurhash || fallbackBlurhash,
            )}
            style={styles.thumbnailImage}
            contentFit="cover"
            placeholderContentFit="cover"
            width={THUMB_WIDTH * 2}
            quality={70}
          />
          {isCurrent ? (
            <View style={styles.nowPlaying} pointerEvents="none">
              <Ionicons name="play" size={22} color="#FFFFFF" />
            </View>
          ) : null}
          {percent !== null && percent >= 1 ? (
            <View style={styles.progressTrack} pointerEvents="none">
              <View
                style={[
                  styles.progressFill,
                  { width: `${percent}%` },
                  completed && styles.progressFillComplete,
                ]}
              />
            </View>
          ) : null}
        </View>
        <View style={styles.episodeText}>
          <Text
            style={[
              styles.episodeTitle,
              isCurrent && styles.episodeTitleCurrent,
            ]}
            numberOfLines={2}
          >
            {String(episode.episodeNumber).padStart(2, "0")}
            {episode.title ? ` · ${episode.title}` : ""}
          </Text>
          {minutes ? <Text style={styles.episodeMeta}>{minutes}</Text> : null}
        </View>
        <Pressable
          style={styles.moreButton}
          onPress={() => onMore(episode)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Episode ${episode.episodeNumber} options`}
        >
          <Ionicons
            name="ellipsis-vertical"
            size={18}
            color="rgba(255, 255, 255, 0.7)"
          />
        </Pressable>
      </Pressable>
    );
  },
);
EpisodeRow.displayName = "EpisodeRow";

interface ActionButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  caption?: string | null;
  onPress: () => void;
}

function ActionButton({ icon, label, caption, onPress }: ActionButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color="#FFFFFF" />
      <Text style={styles.actionLabel} numberOfLines={1}>
        {label}
      </Text>
      {caption ? (
        <Text style={styles.actionCaption} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * The details surface beneath the video on the portrait watch page: the
 * synopsis, the option actions (episodes, audio & subtitles, quality), and
 * for a show the season picker and its episode list. Tapping an episode
 * plays it in place; the session remounts the player for it.
 */
const MobileWatchDetails = memo(
  ({
    session,
    videoData,
    options,
    qualityBadge,
    onOpenCaptions,
    onOpenAudio,
    onOpenQuality,
    onSelectEpisode,
    onOpenEpisodeInfo,
    onOpenInfo,
  }: MobileWatchDetailsProps) => {
    const insets = useSafeAreaInsets();
    const isShow = session.type === "tv";
    const listRef = useRef<FlatList<TVDeviceEpisode>>(null);
    const [headerHeight, setHeaderHeight] = useState(0);
    const [synopsisExpanded, setSynopsisExpanded] = useState(false);
    const [seasonSheetOpen, setSeasonSheetOpen] = useState(false);
    const [avSheetOpen, setAvSheetOpen] = useState(false);
    const [episodeSheetFor, setEpisodeSheetFor] =
      useState<TVDeviceEpisode | null>(null);
    const [selectedSeason, setSelectedSeason] = useState<number | undefined>(
      session.season,
    );

    const tv = useTVMediaDetails(
      isShow
        ? { mediaType: "tv", mediaId: session.id, season: selectedSeason }
        : null,
    );
    const activeSeason = selectedSeason ?? tv.effectiveSeason;
    const seasons = tv.data?.availableSeasons ?? [];
    const episodes = useMemo<TVDeviceEpisode[]>(
      () =>
        isShow && tv.data?.seasonNumber === activeSeason
          ? (tv.data?.episodes ?? [])
          : [],
      [isShow, tv.data, activeSeason],
    );
    const isCurrentSeason = activeSeason === session.season;
    const currentIndex = useMemo(
      () =>
        isCurrentSeason
          ? episodes.findIndex((e) => e.episodeNumber === session.episode)
          : -1,
      [episodes, isCurrentSeason, session.episode],
    );

    const overview =
      videoData?.metadata?.overview ||
      videoData?.overview ||
      videoData?.description ||
      null;
    const year = yearOf(
      videoData?.releaseDate ??
        (videoData?.metadata?.release_date as string | undefined),
    );
    const rating = videoData?.metadata?.rating as string | undefined;
    const genres = (
      (videoData?.metadata?.genres as { name: string }[] | undefined) ?? []
    )
      .map((g) => g.name)
      .slice(0, 3)
      .join(" · ");
    const runtime = !isShow ? formatMinutes(videoData?.duration) : null;
    const meta = [year, rating, runtime, genres].filter(Boolean).join("  ·  ");

    const scrollToEpisodes = useCallback(() => {
      const index = currentIndex >= 0 ? currentIndex : 0;
      if (episodes.length === 0) return;
      listRef.current?.scrollToIndex({
        index,
        viewPosition: 0,
        animated: true,
      });
    }, [currentIndex, episodes.length]);

    const openAudioSubtitles = useCallback(() => {
      if (options.captions && options.audio) {
        setAvSheetOpen(true);
      } else if (options.captions) {
        onOpenCaptions();
      } else if (options.audio) {
        onOpenAudio();
      }
    }, [options.captions, options.audio, onOpenCaptions, onOpenAudio]);

    const handleEpisodePress = useCallback(
      (episode: TVDeviceEpisode) => {
        if (activeSeason === undefined) return;
        if (isCurrentSeason && episode.episodeNumber === session.episode) {
          return;
        }
        onSelectEpisode(activeSeason, episode.episodeNumber);
      },
      [activeSeason, isCurrentSeason, session.episode, onSelectEpisode],
    );

    const episodeSheetActions = useMemo<ActionSheetAction[]>(() => {
      const episode = episodeSheetFor;
      if (!episode || activeSeason === undefined) return [];
      const isCurrent =
        isCurrentSeason && episode.episodeNumber === session.episode;
      const actions: ActionSheetAction[] = [];
      if (!isCurrent) {
        actions.push({
          id: "play",
          title: "Play",
          icon: "play",
          variant: "primary",
          onPress: () => onSelectEpisode(activeSeason, episode.episodeNumber),
        });
      }
      actions.push({
        id: "restart",
        title: isCurrent ? "Restart from beginning" : "Play from beginning",
        icon: "refresh",
        onPress: () =>
          onSelectEpisode(activeSeason, episode.episodeNumber, true),
      });
      actions.push({
        id: "info",
        title: "Episode info",
        icon: "information-circle-outline",
        onPress: () => onOpenEpisodeInfo(activeSeason, episode.episodeNumber),
      });
      return actions;
    }, [
      episodeSheetFor,
      activeSeason,
      isCurrentSeason,
      session.episode,
      onSelectEpisode,
      onOpenEpisodeInfo,
    ]);

    const seasonActions = useMemo<ActionSheetAction[]>(
      () =>
        seasons.map((season) => ({
          id: String(season),
          title: `Season ${season}`,
          icon:
            season === activeSeason ? "checkmark-circle" : "ellipse-outline",
          onPress: () => setSelectedSeason(season),
        })),
      [seasons, activeSeason],
    );

    const avActions = useMemo<ActionSheetAction[]>(
      () => [
        {
          id: "subtitles",
          title: "Subtitles",
          icon: "text-outline",
          onPress: onOpenCaptions,
        },
        {
          id: "audio",
          title: "Audio",
          icon: "volume-high-outline",
          onPress: onOpenAudio,
        },
      ],
      [onOpenCaptions, onOpenAudio],
    );

    const renderItem = useCallback<ListRenderItem<TVDeviceEpisode>>(
      ({ item, index }) => (
        <EpisodeRow
          episode={item}
          isCurrent={index === currentIndex}
          fallbackThumbnail={tv.data?.backdrop}
          fallbackBlurhash={tv.data?.backdropBlurhash}
          onPress={handleEpisodePress}
          onMore={setEpisodeSheetFor}
        />
      ),
      [
        currentIndex,
        tv.data?.backdrop,
        tv.data?.backdropBlurhash,
        handleEpisodePress,
      ],
    );

    const header = (
      <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        {overview ? (
          <Pressable
            onPress={() => setSynopsisExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityHint="Shows the full synopsis"
          >
            <Text
              style={styles.synopsis}
              numberOfLines={synopsisExpanded ? undefined : SYNOPSIS_LINES}
            >
              {overview}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.actions}>
          {isShow ? (
            <ActionButton
              icon="list-outline"
              label="Episodes"
              onPress={scrollToEpisodes}
            />
          ) : null}
          {options.captions || options.audio ? (
            <ActionButton
              icon="chatbox-ellipses-outline"
              label={
                options.captions && options.audio
                  ? "Audio & subtitles"
                  : options.captions
                    ? "Subtitles"
                    : "Audio"
              }
              onPress={openAudioSubtitles}
            />
          ) : null}
          {options.quality ? (
            <ActionButton
              icon="options-outline"
              label="Quality"
              caption={qualityBadge}
              onPress={onOpenQuality}
            />
          ) : null}
          <ActionButton
            icon="information-circle-outline"
            label="Details"
            onPress={onOpenInfo}
          />
        </View>

        {isShow ? (
          <View style={styles.seasonRow}>
            {seasons.length > 1 ? (
              <Pressable
                style={({ pressed }) => [
                  styles.seasonPill,
                  pressed && styles.seasonPillPressed,
                ]}
                onPress={() => setSeasonSheetOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Season ${activeSeason ?? ""}, choose a season`}
              >
                <Text style={styles.seasonPillText}>
                  Season {activeSeason ?? "…"}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#FFFFFF" />
              </Pressable>
            ) : (
              <Text style={styles.seasonPillText}>
                Season {activeSeason ?? "…"}
              </Text>
            )}
            {tv.isLoadingEpisodes ||
            (isShow && episodes.length === 0 && !tv.error) ? (
              <ActivityIndicator color={Colors.dark.brandPrimary} />
            ) : null}
          </View>
        ) : null}
        {tv.error ? <Text style={styles.error}>{tv.error}</Text> : null}
      </View>
    );

    return (
      <View style={styles.container}>
        <FlatList
          ref={listRef}
          data={episodes}
          keyExtractor={(item) => `s${activeSeason}-e${item.episodeNumber}`}
          renderItem={renderItem}
          ListHeaderComponent={header}
          getItemLayout={(_, index) => ({
            length: ROW_HEIGHT,
            offset: headerHeight + ROW_HEIGHT * index,
            index,
          })}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />

        <MobileActionSheet
          visible={seasonSheetOpen}
          onClose={() => setSeasonSheetOpen(false)}
          title="Season"
          actions={seasonActions}
        />
        <MobileActionSheet
          visible={avSheetOpen}
          onClose={() => setAvSheetOpen(false)}
          title="Audio & subtitles"
          actions={avActions}
        />
        <MobileActionSheet
          visible={episodeSheetFor !== null}
          onClose={() => setEpisodeSheetFor(null)}
          title={
            episodeSheetFor
              ? `Episode ${episodeSheetFor.episodeNumber}`
              : undefined
          }
          subtitle={episodeSheetFor?.title}
          actions={episodeSheetActions}
        />
      </View>
    );
  },
);

MobileWatchDetails.displayName = "MobileWatchDetails";

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    flex: 1,
    gap: 6,
    paddingVertical: 10,
  },
  actionCaption: {
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 11,
  },
  actionLabel: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },
  actionPressed: {
    opacity: 0.6,
  },
  actions: {
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    marginTop: 8,
    paddingBottom: 6,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
  },
  episodeMeta: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 13,
    marginTop: 4,
  },
  episodeRow: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    height: ROW_HEIGHT,
    paddingHorizontal: 4,
    paddingVertical: ROW_VERTICAL_PADDING,
  },
  episodeRowCurrent: {
    backgroundColor: "rgba(74, 158, 255, 0.14)",
    borderColor: "rgba(74, 158, 255, 0.55)",
    borderWidth: 1,
  },
  episodeRowPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  episodeText: {
    flex: 1,
    paddingHorizontal: 12,
  },
  episodeTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
  episodeTitleCurrent: {
    fontWeight: "700",
  },
  error: {
    color: Colors.dark.error,
    fontSize: 13,
    marginTop: 8,
  },
  meta: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 13,
    marginBottom: 6,
  },
  moreButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 32,
  },
  nowPlaying: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  progressFill: {
    backgroundColor: Colors.dark.brandPrimary,
    height: "100%",
  },
  progressFillComplete: {
    backgroundColor: Colors.dark.success,
  },
  progressTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    bottom: 0,
    height: 3,
    left: 0,
    position: "absolute",
    right: 0,
  },
  seasonPill: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  seasonPillPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  seasonPillText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  seasonRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingBottom: 8,
    paddingTop: 12,
  },
  synopsis: {
    color: "rgba(255, 255, 255, 0.78)",
    fontSize: 14,
    lineHeight: 20,
  },
  thumbnail: {
    backgroundColor: "#1a1a1c",
    borderRadius: 6,
    height: THUMB_HEIGHT,
    overflow: "hidden",
    width: THUMB_WIDTH,
  },
  thumbnailImage: {
    height: "100%",
    width: "100%",
  },
});

export default MobileWatchDetails;
