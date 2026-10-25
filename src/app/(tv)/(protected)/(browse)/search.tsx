import { Ionicons } from "@expo/vector-icons";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity as RNTouchableOpacity,
  TVFocusGuideView,
  useTVEventHandler,
  View,
  type HWEvent,
} from "react-native";

import SearchPosterCard, {
  type SearchPosterItem,
} from "@/src/components/TV/Pages/Search/SearchPosterCard";
import {
  PANEL_HEIGHT,
  SearchEmptyPanel,
  SearchPreviewPanel,
} from "@/src/components/TV/Pages/Search/SearchPreviewPanel";
import { RetryNotice } from "@/src/components/TV/RetryNotice";
import { Colors } from "@/src/constants/Colors";
import { isAwaitingFirstData } from "@/src/data/query/queryState";
import { contentService } from "@/src/data/services/contentService";
import { MediaItem, SearchPage } from "@/src/data/types/content.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { useSmartInfiniteScroll } from "@/src/hooks/useSmartInfiniteScroll";
import { navigationHelper } from "@/src/utils/navigationHelper";

// TV-compatible TouchableOpacity (adds the tvos-only focus props)
interface TVTouchableProps extends React.ComponentProps<
  typeof RNTouchableOpacity
> {
  isTVSelectable?: boolean;
  hasTVPreferredFocus?: boolean;
}
const TouchableOpacity =
  RNTouchableOpacity as React.ComponentType<TVTouchableProps>;

// ---------------------------------------------------------------------------
// Layout and behaviour constants (dp; the SHIELD lays the app out at 960x540)
// ---------------------------------------------------------------------------

const KEYBOARD_ROWS = [
  ["a", "b", "c", "d", "e", "f"],
  ["g", "h", "i", "j", "k", "l"],
  ["m", "n", "o", "p", "q", "r"],
  ["s", "t", "u", "v", "w", "x"],
  ["y", "z", "1", "2", "3", "4"],
  ["5", "6", "7", "8", "9", "0"],
];

const NUM_COLUMNS = 5;
const GRID_GAP = 14;
const GRID_ROW_GAP = 18;
// Room for the focused card's scale so it is not clipped at the edges.
const GRID_PADDING = 4;
// Ask for the next page once focus is this many items from the end (half a
// page), so a held key does not reach the bottom before the page arrives.
const LOAD_MORE_LOOKAHEAD = 15;
const SEARCH_DEBOUNCE_MS = 300;
// The preview follows focus, but not every step of a held key.
const PREVIEW_DEBOUNCE_MS = 150;
const SUGGESTION_COUNT = 3;

type SearchType = "movie" | "tv";
const ALL_TYPES: SearchType[] = ["movie", "tv"];

type Filter = "all" | "movie" | "tv";
const FILTERS: { id: Filter; label: string; types: SearchType[] }[] = [
  { id: "all", label: "All", types: ALL_TYPES },
  { id: "movie", label: "Movies", types: ["movie"] },
  { id: "tv", label: "TV Shows", types: ["tv"] },
];

type FocusRegion = "keyboard" | "chips" | "suggestions" | "grid" | "preview";
// Where focus is sent programmatically (rendered as hasTVPreferredFocus).
type FocusTarget = "firstKey" | null;

// Focus steps closer together than this come from a held key (Android repeats
// at ~50 ms; a deliberate press is slower), as ContentGrid also assumes.
const HOLD_REPEAT_MS = 400;
// How long after the last quick step the upward traps stay on.
const HOLD_RELEASE_MS = 700;
// Safety valve for the Up key tracker, in case a key-up never arrives.
const UP_HELD_MAX_MS = 1500;

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

const searchPageOptions = (query: string, types: SearchType[]) => ({
  queryKey: ["search", query, types] as const,
  queryFn: ({ pageParam }: { pageParam: number }) =>
    contentService.searchPage({
      query,
      page: pageParam,
      types,
      isTVdevice: true,
    }),
  initialPageParam: 0,
  getNextPageParam: (lastPage: SearchPage, allPages: SearchPage[]) =>
    lastPage.hasNextPage ? allPages.length : undefined,
});

const toPosterItem = (item: MediaItem): SearchPosterItem => {
  const dateStr =
    item.metadata?.release_date ??
    item.metadata?.first_air_date ??
    item.releaseDate;
  const parsed = dateStr ? new Date(dateStr) : null;
  return {
    id: item.id,
    title: item.title,
    mediaType: item.type === "tv" ? "tv" : "movie",
    posterUrl: item.posterURL,
    posterBlurhash: item.posterBlurhash,
    backdropUrl: item.backdrop,
    backdropBlurhash: item.backdropBlurhash,
    tmdbId: item.tmdbId ?? item.metadata?.tmdbId ?? item.metadata?.tmdb_id,
    year:
      parsed && !isNaN(parsed.getTime())
        ? String(parsed.getFullYear())
        : undefined,
    seasonNumber: item.seasonNumber,
    episodeNumber: item.episodeNumber,
  };
};

// ---------------------------------------------------------------------------
// Left-column controls
// ---------------------------------------------------------------------------

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

interface KeyButtonProps {
  label: string;
  icon?: IoniconName;
  flex?: number;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
  onFocus: () => void;
}

// A keyboard key: readable from across the room when idle, white with a blue
// ring and slightly larger when focused. The ring is a constant-width border
// so focus never reflows the row.
const KeyButton = ({
  label,
  icon,
  flex = 1,
  hasTVPreferredFocus = false,
  onPress,
  onFocus,
}: KeyButtonProps) => {
  const [focused, setFocused] = useState(false);
  const color = focused ? Colors.dark.cardBackground : Colors.dark.text;

  return (
    <TouchableOpacity
      style={[styles.key, { flex }, focused && styles.keyFocused]}
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        onFocus();
      }}
      onBlur={() => setFocused(false)}
      activeOpacity={0.8}
      isTVSelectable={Platform.isTV}
      hasTVPreferredFocus={hasTVPreferredFocus && Platform.isTV}
    >
      {icon ? <Ionicons name={icon} size={14} color={color} /> : null}
      <Text
        style={[icon ? styles.keyActionText : styles.keyText, { color }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

interface FilterChipProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  onFocus: () => void;
}

const FilterChip = ({ label, isActive, onPress, onFocus }: FilterChipProps) => {
  const [focused, setFocused] = useState(false);
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        isActive && styles.chipActive,
        focused && styles.chipFocused,
      ]}
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        onFocus();
      }}
      onBlur={() => setFocused(false)}
      activeOpacity={0.8}
      isTVSelectable={Platform.isTV}
    >
      <Text
        style={[styles.chipText, isActive && styles.chipTextActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

interface SuggestionChipProps {
  text: string;
  onPress: () => void;
  onFocus: () => void;
}

const SuggestionChip = ({ text, onPress, onFocus }: SuggestionChipProps) => {
  const [focused, setFocused] = useState(false);
  const color = focused ? Colors.dark.cardBackground : Colors.dark.text;
  return (
    <TouchableOpacity
      style={[styles.suggestion, focused && styles.suggestionFocused]}
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        onFocus();
      }}
      onBlur={() => setFocused(false)}
      activeOpacity={0.8}
      isTVSelectable={Platform.isTV}
    >
      <Ionicons name="search-outline" size={11} color={color} />
      <Text style={[styles.suggestionText, { color }]} numberOfLines={1}>
        {text}
      </Text>
    </TouchableOpacity>
  );
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SearchScreen() {
  const { show: showBackdrop } = useBackdropManager();

  // --- query text -----------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const types = useMemo(
    () => FILTERS.find((f) => f.id === filter)?.types ?? ALL_TYPES,
    [filter],
  );

  const setQuery = useCallback((next: string) => {
    setSearchQuery(next);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(
      () => setDebouncedQuery(next),
      SEARCH_DEBOUNCE_MS,
    );
  }, []);

  // Suggestions and Clear are whole queries: no debounce.
  const setQueryNow = useCallback((next: string) => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    setSearchQuery(next);
    setDebouncedQuery(next);
  }, []);

  const handleKeyPress = useCallback(
    (key: string) => {
      if (key === "Backspace") setQuery(searchQuery.slice(0, -1));
      else if (key === "Space") setQuery(searchQuery + " ");
      else if (key === "Clear") setQueryNow("");
      else setQuery(searchQuery + key);
    },
    [searchQuery, setQuery, setQueryNow],
  );

  // --- focus bookkeeping -----------------------------------------------------
  // Which zone holds focus, and which grid item: read by the Up-press gate.
  const focusRegionRef = useRef<FocusRegion | null>(null);
  const focusedGridIndexRef = useRef(0);
  // Programmatic focus (hasTVPreferredFocus); cleared once the target focuses.
  const [focusTarget, setFocusTarget] = useState<FocusTarget>("firstKey");
  const focusTargetRef = useRef<FocusTarget>("firstKey");
  focusTargetRef.current = focusTarget;

  // The key-repeat stop. Either signal traps upward focus on the grid and on
  // the preview, so a held Up stops on the grid's top row (or, if it slipped
  // past, on the preview) instead of running on into the navigation:
  // - holdBumped: focus has been stepping faster than a human presses, and
  //   stays set until HOLD_RELEASE_MS after the last quick step;
  // - upHeld: an Up key is down (Android reports key-down / key-up pairs),
  //   with a safety valve in case the key-up never arrives.
  // A fresh press moves focus natively before either flag can change, so a
  // deliberate press still steps up: grid → preview → nav.
  const [holdBumped, setHoldBumped] = useState(false);
  const lastFocusStepAt = useRef(0);
  const bumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteFocusStep = useCallback(() => {
    const now = Date.now();
    const quick = now - lastFocusStepAt.current < HOLD_REPEAT_MS;
    lastFocusStepAt.current = now;
    if (!quick) return;
    setHoldBumped(true);
    if (bumpTimer.current) clearTimeout(bumpTimer.current);
    bumpTimer.current = setTimeout(() => setHoldBumped(false), HOLD_RELEASE_MS);
  }, []);
  const [upHeld, setUpHeld] = useState(false);
  const upHeldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trapUpward = holdBumped || upHeld;

  // Select on a poster opens Play / Details / My List for that title. The
  // actions close as soon as focus goes anywhere else (Down or Left), and
  // Back closes them and returns focus to the poster they were opened from.
  const [actionItem, setActionItem] = useState<SearchPosterItem | null>(null);
  const actionItemRef = useRef<SearchPosterItem | null>(null);
  actionItemRef.current = actionItem;
  const actionIndexRef = useRef(0);
  // A poster to focus programmatically (after Back closes the actions).
  const [focusCardIndex, setFocusCardIndex] = useState<number | null>(null);
  const focusCardIndexRef = useRef<number | null>(null);
  focusCardIndexRef.current = focusCardIndex;

  const regionFocus = useCallback((region: FocusRegion) => {
    focusRegionRef.current = region;
    if (focusTargetRef.current) setFocusTarget(null);
    if (region !== "preview" && actionItemRef.current) setActionItem(null);
  }, []);
  const onKeyboardFocus = useCallback(
    () => regionFocus("keyboard"),
    [regionFocus],
  );
  const onChipFocus = useCallback(() => regionFocus("chips"), [regionFocus]);
  const onSuggestionFocus = useCallback(
    () => regionFocus("suggestions"),
    [regionFocus],
  );
  const onPanelFocus = useCallback(() => {
    regionFocus("preview");
    noteFocusStep();
  }, [regionFocus, noteFocusStep]);

  // --- results ----------------------------------------------------------------
  const trimmed = debouncedQuery.trim();
  const hasQuery = trimmed.length > 0;

  // Previous results stay on screen while the next query loads, so typing
  // towards zero results does not flash the empty panel on every keystroke.
  const results = useInfiniteQuery({
    ...searchPageOptions(debouncedQuery, types),
    placeholderData: keepPreviousData,
  });
  // The empty-query page is Recently Added: the default view, and the fallback
  // row under the no-results panel. Same key as the default query, so it is
  // one request.
  const recent = useInfiniteQuery(searchPageOptions("", ALL_TYPES));

  const resultItems = useMemo(
    () => (results.data?.pages ?? []).flatMap((p) => p.items).map(toPosterItem),
    [results.data],
  );
  const recentItems = useMemo(
    () => (recent.data?.pages ?? []).flatMap((p) => p.items).map(toPosterItem),
    [recent.data],
  );

  const isAwaitingResults = isAwaitingFirstData({
    isPending: results.isPending,
    isFetching: results.isFetching,
    isPaused: results.isPaused,
  });
  const isEmpty =
    hasQuery &&
    !results.error &&
    !results.isFetching &&
    !results.isPlaceholderData &&
    resultItems.length === 0;

  const gridItems = isEmpty ? recentItems : resultItems;
  const activeQuery = isEmpty ? recent : results;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = activeQuery;
  const highlight = isEmpty ? "" : trimmed;

  const total = results.data?.pages[0]?.total ?? resultItems.length;
  const recentTotal = recent.data?.pages[0]?.total ?? recentItems.length;
  const heading = hasQuery
    ? `Results for “${debouncedQuery}”`
    : "Recently added";
  const countLabel = !hasQuery
    ? `${recentTotal} ${recentTotal === 1 ? "title" : "titles"}`
    : isEmpty
      ? "No titles"
      : `${total} ${total === 1 ? "title" : "titles"}`;

  // Completions of the query: the first few result titles, as typeable text.
  const suggestions = useMemo(() => {
    if (!hasQuery || isEmpty) return [];
    const needle = trimmed.toLowerCase();
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of resultItems) {
      const text = item.title.toLowerCase();
      if (text === needle || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
      if (out.length === SUGGESTION_COUNT) break;
    }
    return out;
  }, [hasQuery, isEmpty, trimmed, resultItems]);

  // --- grid + preview ---------------------------------------------------------
  const listRef = useRef<FlatList<SearchPosterItem>>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const posterWidth = gridWidth
    ? Math.floor(
        (gridWidth - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) /
          NUM_COLUMNS,
      )
    : 0;
  const handleGridLayout = useCallback((e: LayoutChangeEvent) => {
    setGridWidth(e.nativeEvent.layout.width);
  }, []);

  const [previewIndex, setPreviewIndex] = useState(0);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewItem = gridItems.length
    ? gridItems[Math.min(previewIndex, gridItems.length - 1)]
    : undefined;

  // A new list starts at its first title.
  useEffect(() => {
    setPreviewIndex(0);
    focusedGridIndexRef.current = 0;
    try {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    } catch {
      // never let a scroll hiccup take the screen down
    }
  }, [debouncedQuery, filter, isEmpty]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  // Read through refs so the per-card focus handler stays stable across page
  // loads (a new handler would re-render every visible card mid-scroll).
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const gridLengthRef = useRef(0);
  gridLengthRef.current = gridItems.length;

  // Velocity/onEndReached-based loading as the fallback for a held key.
  const smartScroll = useSmartInfiniteScroll({
    hasNextPage: !!hasNextPage,
    isFetching: isFetchingNextPage,
    onLoadMore: loadMore,
    predictAheadMs: 1000,
    endReachedThreshold: 2,
  });

  const handleItemFocus = useCallback(
    (index: number) => {
      regionFocus("grid");
      noteFocusStep();
      focusedGridIndexRef.current = index;
      if (focusCardIndexRef.current !== null) setFocusCardIndex(null);
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(
        () => setPreviewIndex(index),
        PREVIEW_DEBOUNCE_MS,
      );
      if (index >= gridLengthRef.current - LOAD_MORE_LOOKAHEAD) {
        loadMoreRef.current();
      }
    },
    [regionFocus, noteFocusStep],
  );

  useEffect(
    () => () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      if (bumpTimer.current) clearTimeout(bumpTimer.current);
      if (upHeldTimer.current) clearTimeout(upHeldTimer.current);
    },
    [],
  );

  // --- Up key tracking (see trapUpward above) --------------------------------
  const handleTVEvent = useCallback((event: HWEvent) => {
    if (!event || event.eventType !== "up") return;
    const action = Number(event.eventKeyAction);
    if (upHeldTimer.current) clearTimeout(upHeldTimer.current);
    if (action === 1) {
      setUpHeld(false);
      return;
    }
    if (action !== 0) return;
    // Key-down, including every auto-repeat: keep the valve armed while held.
    setUpHeld(true);
    upHeldTimer.current = setTimeout(() => setUpHeld(false), UP_HELD_MAX_MS);
  }, []);
  useTVEventHandler(handleTVEvent);

  // --- poster actions ---------------------------------------------------------
  const openPosterActions = useCallback(
    (item: SearchPosterItem, index: number) => {
      actionIndexRef.current = index;
      setActionItem(item);
    },
    [],
  );
  const closeActions = useCallback((refocusPoster: boolean) => {
    setActionItem(null);
    if (refocusPoster) setFocusCardIndex(actionIndexRef.current);
  }, []);

  useEffect(() => {
    if (!actionItem) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        closeActions(true);
        return true;
      },
    );
    return () => subscription.remove();
  }, [actionItem, closeActions]);

  // --- navigation -------------------------------------------------------------
  const openDetails = useCallback(
    (item: SearchPosterItem) => {
      setActionItem(null);
      if (item.backdropUrl) {
        showBackdrop(item.backdropUrl, {
          fade: true,
          duration: 300,
          blurhash: item.backdropBlurhash,
        });
      }
      const images = {
        ...(item.backdropUrl && { backdrop: item.backdropUrl }),
        ...(item.backdropBlurhash && {
          backdropBlurhash: item.backdropBlurhash,
        }),
      };
      if (item.mediaType === "tv" && item.seasonNumber && item.episodeNumber) {
        navigationHelper.navigateToEpisodeInfo({
          showId: item.id,
          season: item.seasonNumber,
          episode: item.episodeNumber,
          ...images,
        });
      } else {
        navigationHelper.navigateToMediaInfo({
          id: item.id,
          type: item.mediaType,
          ...(item.seasonNumber && { season: item.seasonNumber }),
          ...images,
        });
      }
    },
    [showBackdrop],
  );

  const play = useCallback(
    (item: SearchPosterItem) => {
      setActionItem(null);
      if (item.backdropUrl) {
        showBackdrop(item.backdropUrl, {
          fade: true,
          duration: 300,
          blurhash: item.backdropBlurhash,
        });
      }
      navigationHelper.navigateToWatch({
        id: item.id,
        type: item.mediaType,
        ...(item.seasonNumber && { season: item.seasonNumber }),
        ...(item.episodeNumber && { episode: item.episodeNumber }),
        ...(item.backdropUrl && { backdrop: item.backdropUrl }),
        ...(item.backdropBlurhash && {
          backdropBlurhash: item.backdropBlurhash,
        }),
      });
    },
    [showBackdrop],
  );

  // Clear search unmounts the button that held focus, so focus is sent to the
  // first key, where the user is about to type again.
  const clearSearch = useCallback(() => {
    setQueryNow("");
    setFocusTarget("firstKey");
  }, [setQueryNow]);

  // --- render helpers ---------------------------------------------------------
  const renderItem = useCallback(
    ({ item, index }: { item: SearchPosterItem; index: number }) => (
      <SearchPosterCard
        item={item}
        index={index}
        width={posterWidth}
        highlight={highlight}
        hasTVPreferredFocus={index === focusCardIndex}
        onFocus={handleItemFocus}
        onPress={openPosterActions}
      />
    ),
    [
      posterWidth,
      highlight,
      focusCardIndex,
      handleItemFocus,
      openPosterActions,
    ],
  );
  const keyExtractor = useCallback(
    (item: SearchPosterItem, index: number) => `${item.id}-${index}`,
    [],
  );

  const showError = !!results.error && resultItems.length === 0;
  // The preview follows focus; while actions are open it stays on their title.
  const panelItem = actionItem ?? previewItem;
  const panelFocusable = !!actionItem || isEmpty;

  return (
    <View style={styles.container}>
      {/* Left column: query, filters, keyboard, suggestions */}
      <View style={styles.leftColumn}>
        <View style={styles.queryField}>
          <Ionicons
            name="search"
            size={17}
            color={Colors.dark.videoDescriptionText}
          />
          <Text
            style={[styles.queryText, !searchQuery && styles.queryPlaceholder]}
            numberOfLines={1}
          >
            {searchQuery || "Search titles"}
          </Text>
          <View style={styles.caret} />
        </View>

        {/* Up from the keyboard lands here on purpose; nothing lies left. */}
        <TVFocusGuideView trapFocusLeft style={styles.chipsRow}>
          {FILTERS.map((f) => (
            <FilterChip
              key={f.id}
              label={f.label}
              isActive={filter === f.id}
              onPress={() => setFilter(f.id)}
              onFocus={onChipFocus}
            />
          ))}
        </TVFocusGuideView>

        {/* autoFocus returns focus to the last key when coming back from the
            results. Down is trapped while there are no suggestions, so the
            bottom row cannot drop into the grid. */}
        <TVFocusGuideView
          autoFocus
          trapFocusLeft
          trapFocusDown={suggestions.length === 0}
          style={styles.keyboard}
        >
          {KEYBOARD_ROWS.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.keyboardRow}>
              {row.map((key, keyIndex) => (
                <KeyButton
                  key={key}
                  label={key}
                  hasTVPreferredFocus={
                    focusTarget === "firstKey" &&
                    rowIndex === 0 &&
                    keyIndex === 0
                  }
                  onPress={() => handleKeyPress(key)}
                  onFocus={onKeyboardFocus}
                />
              ))}
            </View>
          ))}
          <View style={styles.keyboardRow}>
            <KeyButton
              label="Space"
              flex={2}
              onPress={() => handleKeyPress("Space")}
              onFocus={onKeyboardFocus}
            />
            <KeyButton
              label="Delete"
              icon="backspace-outline"
              onPress={() => handleKeyPress("Backspace")}
              onFocus={onKeyboardFocus}
            />
            <KeyButton
              label="Clear"
              onPress={() => handleKeyPress("Clear")}
              onFocus={onKeyboardFocus}
            />
          </View>
        </TVFocusGuideView>

        {/* Reserved height, so the keyboard never moves when these appear. */}
        <TVFocusGuideView
          trapFocusLeft
          trapFocusDown
          style={styles.suggestions}
        >
          <Text style={styles.sectionLabel}>
            {suggestions.length ? "Suggestions" : ""}
          </Text>
          <View style={styles.suggestionRow}>
            {suggestions.map((text) => (
              <SuggestionChip
                key={text}
                text={text}
                onPress={() => setQueryNow(text)}
                onFocus={onSuggestionFocus}
              />
            ))}
          </View>
        </TVFocusGuideView>
      </View>

      {/* Right column: heading, preview or no-results panel, poster grid */}
      <View style={styles.resultsColumn}>
        <View style={styles.resultsHeader}>
          <Text style={styles.heading} numberOfLines={1}>
            {heading}
          </Text>
          <Text style={styles.count} numberOfLines={1}>
            {countLabel}
          </Text>
        </View>

        {/* A focus target only while it holds buttons: the open actions, or
            Clear search when nothing matched. */}
        <TVFocusGuideView
          autoFocus={panelFocusable}
          trapFocusRight
          trapFocusUp={trapUpward}
          style={styles.panelGuide}
        >
          {isEmpty ? (
            <SearchEmptyPanel
              query={debouncedQuery}
              onButtonFocus={onPanelFocus}
              onClear={clearSearch}
            />
          ) : panelItem ? (
            <SearchPreviewPanel
              key={panelItem.id}
              item={panelItem}
              actionsOpen={actionItem?.id === panelItem.id}
              onButtonFocus={onPanelFocus}
              onPlay={play}
              onDetails={openDetails}
            />
          ) : (
            <View style={styles.panelPlaceholder} />
          )}
        </TVFocusGuideView>

        {isEmpty && <Text style={styles.sectionLabel}>Recently added</Text>}

        {/* autoFocus returns focus to the last poster when coming back from
            the keyboard or the panel. Up is trapped only while a key is
            held (trapUpward), so a deliberate press steps up to the panel. */}
        <TVFocusGuideView
          autoFocus
          trapFocusUp={trapUpward}
          trapFocusDown
          trapFocusRight
          style={styles.gridGuide}
          onLayout={handleGridLayout}
        >
          {isAwaitingResults ? (
            <View style={styles.centered}>
              <ActivityIndicator
                color={Colors.dark.brandPrimary}
                size="large"
              />
            </View>
          ) : showError ? (
            <View style={styles.centered}>
              <RetryNotice
                message="Failed to load results."
                onRetry={() => results.refetch()}
                isRetrying={results.isFetching}
              />
            </View>
          ) : posterWidth > 0 ? (
            <FlatList
              ref={listRef}
              data={gridItems}
              extraData={focusCardIndex}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              numColumns={NUM_COLUMNS}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridContent}
              showsVerticalScrollIndicator={false}
              // Clipping detaches off-screen rows from the native tree, which
              // blinds the TV focus engine when navigating back up.
              removeClippedSubviews={false}
              initialNumToRender={10}
              maxToRenderPerBatch={5}
              windowSize={5}
              {...smartScroll}
              ListFooterComponent={
                isFetchingNextPage ? (
                  <ActivityIndicator
                    color={Colors.dark.brandPrimary}
                    style={styles.listFooter}
                  />
                ) : null
              }
            />
          ) : null}
        </TVFocusGuideView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caret: {
    backgroundColor: Colors.dark.brandPrimary,
    borderRadius: 1,
    height: 24,
    width: 2,
  },
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  chip: {
    alignItems: "center",
    backgroundColor: Colors.dark.surfaceElevated,
    borderColor: Colors.dark.transparentBorder,
    borderRadius: 13,
    borderWidth: 1.5,
    flex: 1,
    height: 26,
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: Colors.dark.brandPrimary,
  },
  chipFocused: {
    borderColor: Colors.dark.whiteBg,
  },
  chipText: {
    color: Colors.dark.text,
    fontSize: 11,
    fontWeight: "600",
  },
  chipTextActive: {
    color: Colors.dark.cardBackground,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 6,
  },
  container: {
    backgroundColor: Colors.dark.background,
    flex: 1,
    flexDirection: "row",
    gap: 36,
    paddingHorizontal: 40,
    paddingTop: 16,
  },
  count: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 11,
  },
  gridContent: {
    paddingBottom: 120,
    paddingHorizontal: GRID_PADDING,
    paddingTop: GRID_PADDING,
  },
  gridGuide: {
    flex: 1,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_ROW_GAP,
  },
  heading: {
    color: Colors.dark.whiteText,
    flexShrink: 1,
    fontSize: 22,
    fontWeight: "800",
  },
  key: {
    alignItems: "center",
    backgroundColor: Colors.dark.surfaceElevated,
    borderColor: Colors.dark.transparentBorder,
    borderRadius: 6,
    borderWidth: 2,
    flexDirection: "row",
    gap: 5,
    height: 31,
    justifyContent: "center",
  },
  keyActionText: {
    fontSize: 11,
    fontWeight: "600",
  },
  keyFocused: {
    backgroundColor: Colors.dark.whiteBg,
    borderColor: Colors.dark.brandPrimary,
    transform: [{ scale: 1.06 }],
    zIndex: 2,
  },
  keyText: {
    fontSize: 15,
    fontWeight: "600",
  },
  keyboard: {
    gap: 6,
  },
  keyboardRow: {
    flexDirection: "row",
    gap: 6,
  },
  leftColumn: {
    gap: 10,
    width: 300,
  },
  listFooter: {
    paddingVertical: 20,
  },
  panelGuide: {
    height: PANEL_HEIGHT,
  },
  panelPlaceholder: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 11,
    height: PANEL_HEIGHT,
  },
  queryField: {
    alignItems: "center",
    backgroundColor: Colors.dark.cardBackground,
    borderColor: Colors.dark.brandPrimary,
    borderRadius: 9,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 9,
    height: 52,
    paddingHorizontal: 14,
  },
  queryPlaceholder: {
    color: Colors.dark.placeholderText,
    fontWeight: "500",
  },
  queryText: {
    color: Colors.dark.whiteText,
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
  },
  resultsColumn: {
    flex: 1,
    gap: 12,
    minWidth: 0,
  },
  resultsHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 10,
  },
  sectionLabel: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  suggestion: {
    alignItems: "center",
    borderColor: Colors.dark.outline,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 5,
    height: 26,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  suggestionFocused: {
    backgroundColor: Colors.dark.whiteBg,
    borderColor: Colors.dark.brandPrimary,
  },
  suggestionRow: {
    flexDirection: "row",
    gap: 6,
    height: 26,
  },
  suggestionText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "500",
  },
  suggestions: {
    gap: 6,
    marginTop: 2,
  },
});
