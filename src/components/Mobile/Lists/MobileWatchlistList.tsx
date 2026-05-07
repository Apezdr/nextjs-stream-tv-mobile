import { memo, useCallback } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { MobileContentCardData } from "@/src/components/Mobile/Cards/MobileContentCard";
import MobileContentList from "@/src/components/Mobile/Lists/MobileContentList";
import { Colors } from "@/src/constants/Colors";
import { WatchlistPlaylist } from "@/src/data/types/content.types";

export type WatchlistFilter = "all" | "movie" | "tv";

const FILTER_OPTIONS: Array<{ label: string; value: WatchlistFilter }> = [
  { label: "All", value: "all" },
  { label: "Movies", value: "movie" },
  { label: "TV Shows", value: "tv" },
];

export interface MobileWatchlistListProps {
  // Playlist selector
  playlists: WatchlistPlaylist[];
  selectedPlaylistId: string;
  onSelectPlaylist: (id: string) => void;
  // Media type filter
  mediaFilter: WatchlistFilter;
  onSelectFilter: (filter: WatchlistFilter) => void;
  // Content
  data: MobileContentCardData[];
  onPlayContent: (
    showId: string,
    mediaType: "movie" | "tv",
    seasonNumber?: number,
    episodeNumber?: number,
    backdropUrl?: string,
    backdropBlurhash?: string,
  ) => void;
  onInfoContent: (
    showId: string,
    mediaType: "movie" | "tv",
    seasonNumber?: number,
    episodeNumber?: number,
    backdropUrl?: string,
    backdropBlurhash?: string,
  ) => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  loading?: boolean;
  emptyMessage?: string;
}

const MobileWatchlistList = ({
  playlists,
  selectedPlaylistId,
  onSelectPlaylist,
  mediaFilter,
  onSelectFilter,
  data,
  onPlayContent,
  onInfoContent,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  isRefreshing = false,
  onRefresh,
  loading = false,
  emptyMessage = "No items found for this playlist",
}: MobileWatchlistListProps) => {
  const handleSelectPlaylist = useCallback(
    (id: string) => onSelectPlaylist(id),
    [onSelectPlaylist],
  );

  const handleSelectFilter = useCallback(
    (filter: WatchlistFilter) => onSelectFilter(filter),
    [onSelectFilter],
  );

  return (
    <View style={styles.container}>
      {playlists.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.playlistSelector}
          contentContainerStyle={styles.playlistSelectorContent}
        >
          {playlists.map((playlist) => {
            const isSelected = playlist.id === selectedPlaylistId;
            return (
              <TouchableOpacity
                key={playlist.id}
                onPress={() => handleSelectPlaylist(playlist.id)}
                style={[
                  styles.playlistButton,
                  isSelected && styles.playlistButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.playlistButtonText,
                    isSelected && styles.playlistButtonTextActive,
                  ]}
                >
                  {playlist.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((option) => {
          const isActive = option.value === mediaFilter;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => handleSelectFilter(option.value)}
              style={[
                styles.filterButton,
                isActive && styles.filterButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  isActive && styles.filterButtonTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <MobileContentList
        title=""
        data={data}
        onPlayContent={onPlayContent}
        onInfoContent={onInfoContent}
        layout="grid"
        cardSize="medium"
        showHeader={false}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={onLoadMore}
        loading={loading}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        emptyMessage={emptyMessage}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterButton: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 8,
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterButtonActive: {
    backgroundColor: Colors.dark.brandPrimary,
  },
  filterButtonText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    fontWeight: "600",
  },
  filterButtonTextActive: {
    color: Colors.dark.whiteText,
  },
  filterRow: {
    flexDirection: "row",
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  playlistButton: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 8,
    marginRight: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  playlistButtonActive: {
    backgroundColor: Colors.dark.whiteText,
  },
  playlistButtonText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    fontWeight: "600",
  },
  playlistButtonTextActive: {
    color: Colors.dark.background,
  },
  playlistSelector: {
    marginBottom: 10,
    maxHeight: 42,
    minHeight: 42,
    paddingHorizontal: 16,
  },
  playlistSelectorContent: {
    alignItems: "center",
    paddingRight: 16,
  },
});

const areEqual = (
  prev: MobileWatchlistListProps,
  next: MobileWatchlistListProps,
) =>
  prev.selectedPlaylistId === next.selectedPlaylistId &&
  prev.mediaFilter === next.mediaFilter &&
  prev.playlists.length === next.playlists.length &&
  prev.data.length === next.data.length &&
  prev.loading === next.loading &&
  prev.isRefreshing === next.isRefreshing &&
  prev.isFetchingNextPage === next.isFetchingNextPage &&
  prev.hasNextPage === next.hasNextPage;

export default memo(MobileWatchlistList, areEqual);
