import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { ActionSheetAction } from "@/src/components/Mobile/ActionSheet/MobileActionSheet";
import { queryKeys } from "@/src/data/query/queryKeys";
import { contentService } from "@/src/data/services/contentService";
import {
  WatchlistContentResponse,
  WatchlistPlaylist,
} from "@/src/data/types/content.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { navigationHelper } from "@/src/utils/navigationHelper";

export interface ActionSheetContentData {
  id: string;
  tmdbId?: number;
  title: string;
  mediaType: "movie" | "tv";
  seasonNumber?: number;
  episodeNumber?: number;
  isUnavailable?: boolean;
  isComingSoon?: boolean;
  comingSoonDate?: string | null;
  backdrop?: string;
  backdropBlurhash?: string;
}

export interface ActionSheetCallbacks {
  onClose: () => void;
  onPlay?: (contentData: ActionSheetContentData) => void;
  onRestart?: (contentData: ActionSheetContentData) => void;
  onInfo?: (contentData: ActionSheetContentData) => void;
}

export type ActionSheetContext = "episode" | "movie" | "show" | "card";

export interface ActionSheetConfig {
  actions: ActionSheetAction[];
  title: string;
  subtitle?: string;
  /** When set, the device back button navigates within the sheet instead of closing it */
  onBack?: () => void;
}

const WATCHLIST_DEBUG_ENABLED = __DEV__;

interface InfiniteWatchlistCache {
  pages: WatchlistContentResponse[];
  pageParams: unknown[];
}

/** Stable key combining the item's status key with a specific playlist ID */
function resolvePlaylistStatusKey(statusKey: string, playlistId: string) {
  return `${statusKey}::${playlistId}`;
}

export const useActionSheetConfig = () => {
  const { show: showBackdrop } = useBackdropManager();
  const queryClient = useQueryClient();

  // Default-playlist watchlist state
  const statusRequestsRef = useRef<Set<string>>(new Set());
  const watchlistStatusCacheRef = useRef<Record<string, boolean>>({});
  const defaultPlaylistRequestRef = useRef<Promise<string | undefined> | null>(
    null,
  );
  const [watchlistStatusByKey, setWatchlistStatusByKey] = useState<
    Record<string, boolean>
  >({});
  const [watchlistTogglingKeys, setWatchlistTogglingKeys] = useState<
    Record<string, boolean>
  >({});
  const [defaultPlaylistId, setDefaultPlaylistId] = useState<string | null>(
    null,
  );
  const [hasResolvedDefaultPlaylist, setHasResolvedDefaultPlaylist] =
    useState(false);

  // Playlist picker state
  const [playlistPickerKey, setPlaylistPickerKey] = useState<string | null>(
    null,
  );
  const [playlists, setPlaylists] = useState<WatchlistPlaylist[] | null>(null);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const playlistsRef = useRef<WatchlistPlaylist[] | null>(null);
  const isFetchingPlaylistsRef = useRef(false);

  // Per-playlist item status state
  const [playlistStatusByKey, setPlaylistStatusByKey] = useState<
    Record<string, boolean>
  >({});
  const [playlistTogglingByKey, setPlaylistTogglingByKey] = useState<
    Record<string, "adding" | "removing" | false>
  >({});
  const playlistStatusCacheRef = useRef<Record<string, boolean | undefined>>(
    {},
  );
  const playlistStatusRequestsRef = useRef<Set<string>>(new Set());

  const resolveDefaultPlaylistId = useCallback(async (): Promise<
    string | undefined
  > => {
    if (hasResolvedDefaultPlaylist) {
      return defaultPlaylistId ?? undefined;
    }

    if (defaultPlaylistRequestRef.current) {
      return defaultPlaylistRequestRef.current;
    }

    defaultPlaylistRequestRef.current = (async () => {
      try {
        const response = await contentService.getWatchlistPlaylists({
          includeItemCounts: false,
          includeDefaultPlaylist: true,
        });

        const resolvedPlaylistId =
          response.defaultPlaylistId ??
          response.playlists.find((playlist) => playlist.isDefault)?.id ??
          response.playlists[0]?.id;

        setDefaultPlaylistId(resolvedPlaylistId ?? null);
        setHasResolvedDefaultPlaylist(true);

        return resolvedPlaylistId;
      } catch (error) {
        console.warn(
          "[useActionSheetConfig] Failed to resolve default watchlist playlist",
          error,
        );
        setHasResolvedDefaultPlaylist(true);
        setDefaultPlaylistId(null);
        return undefined;
      } finally {
        defaultPlaylistRequestRef.current = null;
      }
    })();

    return defaultPlaylistRequestRef.current;
  }, [defaultPlaylistId, hasResolvedDefaultPlaylist]);

  const resolveTmdbId = useCallback((contentData: ActionSheetContentData) => {
    if (
      typeof contentData.tmdbId === "number" &&
      Number.isFinite(contentData.tmdbId)
    ) {
      return contentData.tmdbId;
    }

    // Do not fall back to parsing the content ID as a tmdbId — internal DB IDs
    // are not TMDB IDs and would cause the watchlist status endpoint to match
    // against unrelated items, producing incorrect inWatchlist responses.
    return null;
  }, []);

  const resolveStatusKey = useCallback(
    (contentData: ActionSheetContentData) => {
      const tmdbId = resolveTmdbId(contentData);
      if (tmdbId) return `${tmdbId}:${contentData.mediaType}`;
      if (contentData.id)
        return `mediaId:${contentData.id}:${contentData.mediaType}`;
      return null;
    },
    [resolveTmdbId],
  );

  const removeItemFromWatchlistCaches = useCallback(
    (
      tmdbId: number | null,
      mediaType: "movie" | "tv",
      mediaId?: string,
      playlistId?: string,
    ) => {
      queryClient.setQueriesData<InfiniteWatchlistCache>(
        {
          // Predicate scopes the update to only the specific playlist that was
          // modified, so sibling watchlist views (e.g. another user's shared
          // playlist) are never touched.
          predicate: (query) => {
            const key = query.queryKey as unknown[];
            if (
              key.length < 5 ||
              key[0] !== "api" ||
              key[1] !== "content" ||
              key[2] !== "watchlist" ||
              key[3] !== "content"
            ) {
              return false;
            }
            // If we know the playlistId, only match that playlist's cache.
            // Otherwise fall back to updating all watchlist content caches.
            if (playlistId) {
              const params = key[4] as Record<string, unknown>;
              return params?.playlistId === playlistId;
            }
            return true;
          },
        },
        (existing) => {
          if (!existing?.pages?.length) {
            return existing;
          }

          return {
            ...existing,
            pages: existing.pages.map((page) => ({
              ...page,
              currentItems: page.currentItems.filter((item) => {
                if (tmdbId !== null) {
                  const itemTmdbId =
                    item.tmdbId ??
                    item.metadata?.tmdbId ??
                    item.metadata?.tmdb_id;
                  if (itemTmdbId === tmdbId && item.type === mediaType) {
                    return false;
                  }
                }
                if (mediaId && item.id === mediaId && item.type === mediaType) {
                  return false;
                }
                return true;
              }),
            })),
          };
        },
      );
    },
    [queryClient],
  );

  const fetchWatchlistStatus = useCallback(
    async (contentData: ActionSheetContentData) => {
      const tmdbId = resolveTmdbId(contentData);
      const mediaId = !tmdbId ? contentData.id : undefined;
      const statusKey = resolveStatusKey(contentData);

      if (!statusKey) {
        return;
      }

      if (
        statusRequestsRef.current.has(statusKey) ||
        watchlistStatusCacheRef.current[statusKey] !== undefined
      ) {
        return;
      }

      try {
        statusRequestsRef.current.add(statusKey);
        const playlistId = await resolveDefaultPlaylistId();
        const response = await contentService.getWatchlistStatus({
          tmdbId: tmdbId ?? undefined,
          mediaId,
          mediaType: contentData.mediaType,
          playlistId,
        });

        if (WATCHLIST_DEBUG_ENABLED) {
          console.log("[useActionSheetConfig.watchlist.status] Result", {
            title: contentData.title,
            tmdbId,
            mediaId,
            mediaType: contentData.mediaType,
            playlistId,
            success: response.success,
            inWatchlist: response.inWatchlist,
          });
        }

        queryClient.setQueryData(
          queryKeys.watchlistStatus({
            tmdbId: tmdbId ?? undefined,
            mediaId,
            mediaType: contentData.mediaType,
            playlistId,
          }),
          response,
        );

        watchlistStatusCacheRef.current[statusKey] = !!response.inWatchlist;
        setWatchlistStatusByKey((prev) => ({
          ...prev,
          [statusKey]: !!response.inWatchlist,
        }));
      } catch (error) {
        console.warn(
          "[useActionSheetConfig] Failed to fetch watchlist status",
          error,
        );
      } finally {
        statusRequestsRef.current.delete(statusKey);
      }
    },
    [resolveDefaultPlaylistId, queryClient, resolveStatusKey, resolveTmdbId],
  );

  const toggleWatchlist = useCallback(
    async (contentData: ActionSheetContentData) => {
      const tmdbId = resolveTmdbId(contentData);
      const statusKey = resolveStatusKey(contentData);
      const mediaId = !tmdbId ? contentData.id : undefined;

      if (!statusKey) {
        console.warn(
          "[useActionSheetConfig] Missing identifier for watchlist toggle",
          { id: contentData.id, title: contentData.title },
        );
        return;
      }

      setWatchlistTogglingKeys((prev) => ({ ...prev, [statusKey]: true }));

      try {
        const playlistId = await resolveDefaultPlaylistId();
        const response = await contentService.toggleWatchlistItem({
          tmdbId: tmdbId ?? undefined,
          mediaId,
          mediaType: contentData.mediaType,
          title: contentData.title,
          playlistId,
        });

        if (WATCHLIST_DEBUG_ENABLED) {
          console.log("[useActionSheetConfig.watchlist.toggle] Result", {
            title: contentData.title,
            tmdbId,
            mediaId,
            mediaType: contentData.mediaType,
            playlistId,
            success: response.success,
            action: response.action,
            message: response.message,
          });
        }

        const resolvedInWatchlist =
          response.action === "added"
            ? true
            : response.action === "removed"
              ? false
              : undefined;

        if (resolvedInWatchlist !== undefined) {
          queryClient.setQueryData(
            queryKeys.watchlistStatus({
              tmdbId: tmdbId ?? undefined,
              mediaId,
              mediaType: contentData.mediaType,
              playlistId,
            }),
            {
              success: response.success,
              inWatchlist: resolvedInWatchlist,
              item: response.item,
            },
          );
        }

        if (resolvedInWatchlist === false) {
          removeItemFromWatchlistCaches(
            tmdbId,
            contentData.mediaType,
            mediaId,
            playlistId,
          );
        }

        // Only invalidate the specific playlist's content so sibling watchlist
        // views (e.g. another user's shared playlist) don't flicker and refetch.
        await Promise.all([
          queryClient.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey as unknown[];
              if (
                key.length < 5 ||
                key[0] !== "api" ||
                key[1] !== "content" ||
                key[2] !== "watchlist" ||
                key[3] !== "content"
              ) {
                return false;
              }
              const params = key[4] as Record<string, unknown>;
              return params?.playlistId === playlistId;
            },
          }),
          queryClient.invalidateQueries({
            queryKey: ["watchlist", "playlists"],
          }),
        ]);

        setWatchlistStatusByKey((prev) => {
          const nextValue =
            response.action === "added"
              ? true
              : response.action === "removed"
                ? false
                : !prev[statusKey];

          if (WATCHLIST_DEBUG_ENABLED) {
            console.log("[useActionSheetConfig.watchlist.toggle] Local state", {
              statusKey,
              previousValue: prev[statusKey],
              nextValue,
            });
          }

          return { ...prev, [statusKey]: nextValue };
        });
      } catch (error) {
        console.warn(
          "[useActionSheetConfig] Failed to toggle watchlist",
          error,
        );
      } finally {
        setWatchlistTogglingKeys((prev) => ({ ...prev, [statusKey]: false }));
      }
    },
    [
      queryClient,
      removeItemFromWatchlistCaches,
      resolveDefaultPlaylistId,
      resolveStatusKey,
      resolveTmdbId,
    ],
  );

  const exitPlaylistPicker = useCallback(() => {
    setPlaylistPickerKey(null);
  }, []);

  const enterPlaylistPicker = useCallback(
    async (contentData: ActionSheetContentData) => {
      const statusKey = resolveStatusKey(contentData);
      if (!statusKey) return;

      const tmdbId = resolveTmdbId(contentData);
      const mediaId = !tmdbId ? contentData.id : undefined;

      // Always clear stale per-playlist statuses for this item so the picker
      // shows fresh membership data rather than potentially stale cached values.
      const prefix = statusKey + "::";
      for (const k of Object.keys(playlistStatusCacheRef.current)) {
        if (k.startsWith(prefix)) delete playlistStatusCacheRef.current[k];
      }
      setPlaylistStatusByKey((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (k.startsWith(prefix)) delete next[k];
        }
        return next;
      });

      // Show the picker immediately — it renders in loading state until playlists arrive
      setPlaylistPickerKey(statusKey);

      let currentPlaylists = playlistsRef.current;

      if (!currentPlaylists) {
        if (isFetchingPlaylistsRef.current) return;
        isFetchingPlaylistsRef.current = true;
        setIsLoadingPlaylists(true);

        try {
          const response = await contentService.getWatchlistPlaylists({
            includeItemCounts: true,
            includeDefaultPlaylist: true,
          });
          currentPlaylists = response.playlists;
          playlistsRef.current = currentPlaylists;
          setPlaylists(currentPlaylists);
        } catch (error) {
          console.warn(
            "[useActionSheetConfig] Failed to fetch playlists",
            error,
          );
          setPlaylistPickerKey(null);
          return;
        } finally {
          isFetchingPlaylistsRef.current = false;
          setIsLoadingPlaylists(false);
        }
      }

      // Fire-and-forget: fetch per-playlist membership status in parallel.
      // The picker is already visible; bookmark icons fill in as responses arrive.
      for (const playlist of currentPlaylists) {
        const key = resolvePlaylistStatusKey(statusKey, playlist.id);
        if (
          playlistStatusCacheRef.current[key] !== undefined ||
          playlistStatusRequestsRef.current.has(key)
        ) {
          continue;
        }

        void (async () => {
          playlistStatusRequestsRef.current.add(key);
          try {
            const response = await contentService.getWatchlistStatus({
              tmdbId: tmdbId ?? undefined,
              mediaId,
              mediaType: contentData.mediaType,
              playlistId: playlist.id,
            });
            playlistStatusCacheRef.current[key] = !!response.inWatchlist;
            setPlaylistStatusByKey((prev) => ({
              ...prev,
              [key]: !!response.inWatchlist,
            }));
          } catch {
            // Silently ignore — playlist row stays in unknown state
          } finally {
            playlistStatusRequestsRef.current.delete(key);
          }
        })();
      }
    },
    [resolveStatusKey, resolveTmdbId],
  );

  const toggleSpecificPlaylist = useCallback(
    async (contentData: ActionSheetContentData, playlistId: string) => {
      const tmdbId = resolveTmdbId(contentData);
      const mediaId = !tmdbId ? contentData.id : undefined;
      const statusKey = resolveStatusKey(contentData);
      if (!statusKey) return;

      const key = resolvePlaylistStatusKey(statusKey, playlistId);
      // Read from cache ref to avoid stale closure on playlistStatusByKey
      const isCurrentlyInPlaylist = !!playlistStatusCacheRef.current[key];

      setPlaylistTogglingByKey((prev) => ({
        ...prev,
        [key]: isCurrentlyInPlaylist ? "removing" : "adding",
      }));

      try {
        if (isCurrentlyInPlaylist) {
          await contentService.removeFromWatchlist({
            tmdbId: tmdbId ?? undefined,
            mediaId,
            mediaType: contentData.mediaType,
            playlistId,
          });
          playlistStatusCacheRef.current[key] = false;
          setPlaylistStatusByKey((prev) => ({ ...prev, [key]: false }));
          removeItemFromWatchlistCaches(
            tmdbId,
            contentData.mediaType,
            mediaId,
            playlistId,
          );
        } else {
          await contentService.addToWatchlist({
            tmdbId: tmdbId ?? undefined,
            mediaId,
            mediaType: contentData.mediaType,
            title: contentData.title,
            playlistId,
          });
          playlistStatusCacheRef.current[key] = true;
          setPlaylistStatusByKey((prev) => ({ ...prev, [key]: true }));
        }

        // Clear the main (default-playlist) status cache so that when the user
        // exits the picker the main toggle re-fetches rather than showing the
        // stale "Add to My List" state.
        delete watchlistStatusCacheRef.current[statusKey];
        setWatchlistStatusByKey((prev) => {
          const next = { ...prev };
          delete next[statusKey];
          return next;
        });

        if (WATCHLIST_DEBUG_ENABLED) {
          console.log("[useActionSheetConfig.watchlist.togglePlaylist]", {
            title: contentData.title,
            playlistId,
            action: isCurrentlyInPlaylist ? "removed" : "added",
          });
        }

        await queryClient.invalidateQueries({
          queryKey: [...queryKeys.content(), "watchlist"],
        });
      } catch (error) {
        console.warn(
          "[useActionSheetConfig] Failed to toggle playlist item",
          error,
        );

        // Re-fetch the real status so the UI doesn't get stuck showing the
        // wrong state (e.g. filled bookmark when the item isn't actually there)
        try {
          const response = await contentService.getWatchlistStatus({
            tmdbId: tmdbId ?? undefined,
            mediaId,
            mediaType: contentData.mediaType,
            playlistId,
          });
          playlistStatusCacheRef.current[key] = !!response.inWatchlist;
          setPlaylistStatusByKey((prev) => ({
            ...prev,
            [key]: !!response.inWatchlist,
          }));
        } catch {
          // Re-fetch failed too — drop the cache entry so next open re-fetches
          delete playlistStatusCacheRef.current[key];
          setPlaylistStatusByKey((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      } finally {
        setPlaylistTogglingByKey((prev) => ({ ...prev, [key]: false }));
      }
    },
    [
      queryClient,
      removeItemFromWatchlistCaches,
      resolveStatusKey,
      resolveTmdbId,
    ],
  );

  const generateConfig = useCallback(
    (
      contentData: ActionSheetContentData,
      context: ActionSheetContext,
      callbacks: ActionSheetCallbacks,
    ): ActionSheetConfig => {
      const { onPlay, onRestart, onInfo } = callbacks;

      const defaultHandlePlay = () => {
        if (contentData.backdrop) {
          showBackdrop(contentData.backdrop, {
            fade: true,
            duration: 300,
            blurhash: contentData.backdropBlurhash,
          });
        }
        navigationHelper.navigateToWatch({
          id: contentData.id,
          type: contentData.mediaType,
          season: contentData.seasonNumber,
          episode: contentData.episodeNumber,
          backdrop: contentData.backdrop,
          backdropBlurhash: contentData.backdropBlurhash,
        });
      };

      const defaultHandleRestart = () => {
        if (contentData.backdrop) {
          showBackdrop(contentData.backdrop, {
            fade: true,
            duration: 300,
            blurhash: contentData.backdropBlurhash,
          });
        }
        navigationHelper.navigateToWatch({
          id: contentData.id,
          type: contentData.mediaType,
          season: contentData.seasonNumber,
          episode: contentData.episodeNumber,
          backdrop: contentData.backdrop,
          backdropBlurhash: contentData.backdropBlurhash,
          restart: "true",
        });
      };

      const defaultHandleInfo = () => {
        if (contentData.backdrop) {
          showBackdrop(contentData.backdrop, {
            fade: true,
            duration: 300,
            blurhash: contentData.backdropBlurhash,
          });
        }
        if (
          contentData.mediaType === "tv" &&
          contentData.seasonNumber &&
          contentData.episodeNumber
        ) {
          navigationHelper.navigateToEpisodeInfo({
            showId: contentData.id,
            season: contentData.seasonNumber,
            episode: contentData.episodeNumber,
          });
        } else {
          navigationHelper.navigateToMediaInfo({
            id: contentData.id,
            type: contentData.mediaType,
            backdrop: contentData.backdrop,
            backdropBlurhash: contentData.backdropBlurhash,
          });
        }
      };

      const handlePlay = onPlay ? () => onPlay(contentData) : defaultHandlePlay;
      const handleRestart = onRestart
        ? () => onRestart(contentData)
        : defaultHandleRestart;
      const handleInfo = onInfo ? () => onInfo(contentData) : defaultHandleInfo;

      const createAction = (
        id: string,
        title: string,
        icon: keyof typeof Ionicons.glyphMap,
        variant: "default" | "primary" | "destructive",
        handler: () => void,
        opts?: {
          preventDismiss?: boolean;
          isLoading?: boolean;
          disabled?: boolean;
        },
      ): ActionSheetAction => ({
        id,
        title,
        icon,
        variant,
        isLoading: opts?.isLoading,
        preventDismiss: opts?.preventDismiss,
        disabled: opts?.disabled,
        onPress: () => {
          handler();
        },
      });

      const resolvedTmdbId = resolveTmdbId(contentData);
      const watchlistStatusKey = resolveStatusKey(contentData);
      const isInWatchlist =
        watchlistStatusKey !== null
          ? watchlistStatusByKey[watchlistStatusKey]
          : undefined;
      const isToggling =
        watchlistStatusKey !== null
          ? (watchlistTogglingKeys[watchlistStatusKey] ?? false)
          : false;
      const isPickerOpen =
        playlistPickerKey !== null && playlistPickerKey === watchlistStatusKey;

      if (watchlistStatusKey && isInWatchlist === undefined && !isToggling) {
        void fetchWatchlistStatus(contentData);
      }

      // PLAYLIST PICKER MODE — transform the sheet in-place to show playlist list
      if (isPickerOpen) {
        const backAction = createAction(
          "picker-back",
          "Back",
          "arrow-back",
          "default",
          exitPlaylistPicker,
          { preventDismiss: true },
        );

        if (isLoadingPlaylists || !playlists) {
          return {
            actions: [
              backAction,
              createAction(
                "picker-loading",
                "Loading your lists...",
                "hourglass-outline",
                "default",
                () => {},
                { disabled: true },
              ),
            ],
            title: contentData.title,
            subtitle: "Add to list",
            onBack: exitPlaylistPicker,
          };
        }

        // True if any toggle is in-flight for this item's playlists
        const anyPlaylistToggling = Object.entries(playlistTogglingByKey).some(
          ([k, v]) => v && k.startsWith(watchlistStatusKey + "::"),
        );

        const playlistActions = playlists.map((playlist) => {
          const plKey = resolvePlaylistStatusKey(
            watchlistStatusKey,
            playlist.id,
          );
          const isInPlaylist = playlistStatusByKey[plKey] ?? false;
          const togglingAction = playlistTogglingByKey[plKey] || false;
          const isTogglingPlaylist = !!togglingAction;

          return createAction(
            `playlist-${playlist.id}`,
            togglingAction === "removing"
              ? "Removing..."
              : togglingAction === "adding"
                ? "Adding..."
                : playlist.name,
            isInPlaylist ? "bookmark" : "bookmark-outline",
            "default",
            () => {
              void toggleSpecificPlaylist(contentData, playlist.id);
            },
            {
              preventDismiss: true,
              isLoading: isTogglingPlaylist,
              disabled: anyPlaylistToggling,
            },
          );
        });

        return {
          actions: [backAction, ...playlistActions],
          title: contentData.title,
          subtitle: "Add to list",
          onBack: exitPlaylistPicker,
        };
      }

      const watchlistAction =
        resolvedTmdbId !== null || !!contentData.id
          ? createAction(
              "toggle-watchlist",
              isToggling
                ? isInWatchlist
                  ? "Removing..."
                  : "Adding..."
                : isInWatchlist
                  ? "Remove from My List"
                  : "Add to My List",
              isInWatchlist ? "bookmark" : "bookmark-outline",
              "default",
              () => {
                void toggleWatchlist(contentData);
              },
              {
                preventDismiss: true,
                isLoading: isToggling,
                disabled: isToggling,
              },
            )
          : null;

      const addToAnotherListAction =
        resolvedTmdbId !== null || !!contentData.id
          ? createAction(
              "add-to-list",
              "Add to another list...",
              "list-outline",
              "default",
              () => {
                void enterPlaylistPicker(contentData);
              },
              { preventDismiss: true, disabled: isToggling },
            )
          : null;

      if (contentData.isUnavailable) {
        const unavailableSubtitle = (() => {
          if (!contentData.isComingSoon) {
            return "This title is currently unavailable";
          }
          if (!contentData.comingSoonDate) {
            return "Coming soon";
          }
          const parsedDate = new Date(contentData.comingSoonDate);
          if (Number.isNaN(parsedDate.getTime())) {
            return "Coming soon";
          }
          return `Coming soon ${parsedDate.toLocaleDateString()}`;
        })();

        return {
          actions: [
            ...(watchlistAction ? [watchlistAction] : []),
            ...(addToAnotherListAction ? [addToAnotherListAction] : []),
            createAction(
              "unavailable-info",
              "Not Available Yet",
              "alert-circle-outline",
              "default",
              () => {},
            ),
          ],
          title: contentData.title,
          subtitle: unavailableSubtitle,
        };
      }

      switch (context) {
        case "episode": {
          return {
            actions: [
              createAction(
                "play",
                "Play Episode",
                "play",
                "primary",
                handlePlay,
              ),
              createAction(
                "restart",
                "Restart From Beginning",
                "refresh",
                "default",
                handleRestart,
              ),
              ...(watchlistAction ? [watchlistAction] : []),
              ...(addToAnotherListAction ? [addToAnotherListAction] : []),
              createAction(
                "info",
                "Episode Info",
                "information-circle",
                "default",
                handleInfo,
              ),
            ],
            title: `Episode ${contentData.episodeNumber}`,
            subtitle: contentData.title,
          };
        }

        case "movie": {
          return {
            actions: [
              createAction("play", "Play Movie", "play", "primary", handlePlay),
              createAction(
                "restart",
                "Restart From Beginning",
                "refresh",
                "default",
                handleRestart,
              ),
              ...(watchlistAction ? [watchlistAction] : []),
              ...(addToAnotherListAction ? [addToAnotherListAction] : []),
              createAction(
                "info",
                "Movie Info",
                "information-circle",
                "default",
                handleInfo,
              ),
            ],
            title: contentData.title,
            subtitle: "Movie Options",
          };
        }

        case "show": {
          return {
            actions: [
              ...(watchlistAction ? [watchlistAction] : []),
              ...(addToAnotherListAction ? [addToAnotherListAction] : []),
              createAction(
                "info",
                "View Seasons and Episodes",
                "information-circle",
                "default",
                handleInfo,
              ),
            ],
            title: contentData.title,
            subtitle: "View Seasons and Episodes",
          };
        }

        case "card": {
          const isEpisode =
            contentData.mediaType === "tv" &&
            contentData.seasonNumber &&
            contentData.episodeNumber;
          const isMovie = contentData.mediaType === "movie";
          const isShow = contentData.mediaType === "tv" && !isEpisode;

          if (isShow) {
            return {
              actions: [
                ...(watchlistAction ? [watchlistAction] : []),
                ...(addToAnotherListAction ? [addToAnotherListAction] : []),
                createAction(
                  "info",
                  "View Seasons and Episodes",
                  "list",
                  "default",
                  handleInfo,
                ),
              ],
              title: contentData.title,
              subtitle: "TV Show",
            };
          }

          const playTitle = isMovie ? "Play Movie" : "Play";
          const infoTitle = isEpisode ? "Episode Info" : "Movie Info";
          const subtitle = isEpisode
            ? `S${contentData.seasonNumber}E${contentData.episodeNumber}`
            : "Movie";

          return {
            actions: [
              createAction("play", playTitle, "play", "primary", handlePlay),
              createAction(
                "restart",
                "Restart From Beginning",
                "refresh",
                "default",
                handleRestart,
              ),
              ...(watchlistAction ? [watchlistAction] : []),
              ...(addToAnotherListAction ? [addToAnotherListAction] : []),
              createAction(
                "info",
                infoTitle,
                "information-circle",
                "default",
                handleInfo,
              ),
            ],
            title: contentData.title,
            subtitle,
          };
        }

        default: {
          return {
            actions: [
              createAction(
                "info",
                "Info",
                "information-circle",
                "default",
                handleInfo,
              ),
            ],
            title: contentData.title,
            subtitle: "Options",
          };
        }
      }
    },
    [
      enterPlaylistPicker,
      exitPlaylistPicker,
      fetchWatchlistStatus,
      isLoadingPlaylists,
      playlistPickerKey,
      playlists,
      playlistStatusByKey,
      playlistTogglingByKey,
      resolveStatusKey,
      showBackdrop,
      toggleSpecificPlaylist,
      toggleWatchlist,
      watchlistStatusByKey,
      watchlistTogglingKeys,
    ],
  );

  const invalidateItemStatus = useCallback(
    (contentData: ActionSheetContentData) => {
      const statusKey = resolveStatusKey(contentData);
      if (!statusKey) return;

      // Clear default-playlist status
      delete watchlistStatusCacheRef.current[statusKey];
      setWatchlistStatusByKey((prev) => {
        const next = { ...prev };
        delete next[statusKey];
        return next;
      });

      // Clear per-playlist statuses for this item
      const prefix = statusKey + "::";
      for (const k of Object.keys(playlistStatusCacheRef.current)) {
        if (k.startsWith(prefix)) delete playlistStatusCacheRef.current[k];
      }
      setPlaylistStatusByKey((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (k.startsWith(prefix)) delete next[k];
        }
        return next;
      });

      // Exit playlist picker if this item was showing it
      setPlaylistPickerKey((prev) => (prev === statusKey ? null : prev));
    },
    [resolveStatusKey],
  );

  return { generateConfig, invalidateItemStatus };
};
