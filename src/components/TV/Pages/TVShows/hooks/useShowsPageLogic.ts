/**
 * Extracted TV shows page logic for code-splitting
 * Handles TV navigation and data management
 */
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useState,
  startTransition,
  useDeferredValue,
} from "react";
import { InteractionManager } from "react-native";

import { useTVAppState } from "@/src/context/TVAppStateContext";
import { useGenresList } from "@/src/data/hooks/queries/useContentQueries";
import { useRootShowData } from "@/src/data/hooks/useContent";
import { MediaItem } from "@/src/data/types/content.types";

export function useShowsPageLogic() {
  const { currentMode, setMode } = useTVAppState();
  const router = useRouter();
  const isFocused = useIsFocused();

  // Conditional logging for performance optimization
  const DEBUG_SHOWS_PAGE = __DEV__ && false;
  const logDebug = useCallback((message: string, data?: any) => {
    if (DEBUG_SHOWS_PAGE) {
      console.log(`[TVShowsPage] ${message}`, data);
    }
  }, []);

  // Ensure we're in browse mode when this page loads
  useEffect(() => {
    if (currentMode !== "browse") {
      setMode("browse");
    }
  }, [currentMode, setMode]);

  // Fetch available TV show genres
  const {
    data: genresData,
    isLoading: isLoadingGenres,
    error: genresError,
    refetch: refetchGenres,
  } = useGenresList({
    type: "tv",
    includeCounts: true,
    isTVdevice: true,
  });

  // Defer large props to avoid blocking initial paint
  const deferredGenresData = useDeferredValue(genresData);

  // Additional deferred value for the filtered and processed genres
  const processedGenres = useDeferredValue(
    deferredGenresData?.availableGenres?.filter(
      (genre) => genre.tvShowCount && genre.tvShowCount > 0,
    ) || [],
  );

  // Shared transformation function for TV show items
  const transformMediaItems = useCallback((items: MediaItem[]) => {
    return items.map((item) => {
      return {
        id: item.id,
        title: item.title,
        description: `TV SHOW • ${item.hdr || "HD"}`,
        thumbnailUrl: item.thumbnailUrl || item.posterURL,
        thumbnailBlurhash: item.thumbnailBlurhash || item.posterBlurhash || "",
        seasonNumber: undefined,
        episodeNumber: undefined,
        mediaType: item.type as "movie" | "tv",
        link: item.link,
        backdropUrl: item.backdropUrl || item.backdrop,
        backdropBlurhash: item.backdropBlurhash,
        hdr: item.hdr,
        logo: item.logo,
      };
    });
  }, []);

  // State for managing TV show season queries
  const [pendingTVNavigation, setPendingTVNavigation] = useState<{
    showId: string;
    mediaType: "tv";
  } | null>(null);

  // Hook to fetch available seasons when a TV show is selected
  const {
    data: rootShowData,
    isLoading: isLoadingRootShow,
    error: rootShowError,
  } = useRootShowData(pendingTVNavigation?.showId || "", !!pendingTVNavigation);

  // Effect to handle navigation once root show data is loaded
  useEffect(() => {
    if (pendingTVNavigation && rootShowData && !isLoadingRootShow) {
      const { showId, mediaType } = pendingTVNavigation;
      const { availableSeasons } = rootShowData;

      const firstAvailableSeason =
        availableSeasons.length > 0 ? Math.min(...availableSeasons) : 1;

      logDebug("Navigating to TV show with first available season:", {
        id: showId,
        type: mediaType,
        season: firstAvailableSeason,
        availableSeasons,
      });

      router.push(
        {
          pathname: "/media-info/[id]",
          params: {
            id: showId,
            type: mediaType,
            season: firstAvailableSeason,
          },
        },
        {
          dangerouslySingular: true,
        },
      );

      startTransition(() => {
        setPendingTVNavigation(null);
      });
    }
  }, [pendingTVNavigation, rootShowData, isLoadingRootShow, router]);

  // Effect to handle root show data errors
  useEffect(() => {
    if (pendingTVNavigation && rootShowError && !isLoadingRootShow) {
      const { showId, mediaType } = pendingTVNavigation;

      logDebug(
        "Failed to fetch root show data, falling back to season 1:",
        rootShowError,
      );

      router.push(
        {
          pathname: "/media-info/[id]",
          params: {
            id: showId,
            type: mediaType,
            season: 1,
          },
        },
        {
          dangerouslySingular: true,
        },
      );

      startTransition(() => {
        setPendingTVNavigation(null);
      });
    }
  }, [pendingTVNavigation, rootShowError, isLoadingRootShow, router]);

  const handleSelectContent = useCallback(
    (
      showId: string,
      seasonNumber: number | undefined,
      episodeNumber: number | undefined,
      mediaType: "movie" | "tv",
      backdropUrl?: string,
      backdropBlurhash?: string,
    ) => {
      if (mediaType === "tv" && seasonNumber && episodeNumber) {
        logDebug("Navigating to specific episode:", {
          id: showId,
          type: mediaType,
          season: seasonNumber,
          episode: episodeNumber,
        });

        router.push(
          {
            pathname: "/watch/[id]",
            params: {
              id: showId,
              type: mediaType,
              season: seasonNumber,
              episode: episodeNumber,
              ...(backdropUrl && { backdrop: backdropUrl }),
              ...(backdropBlurhash && { backdropBlurhash }),
            },
          },
          {
            dangerouslySingular: true,
          },
        );
      } else if (mediaType === "tv") {
        logDebug("Querying available seasons for TV show:", {
          id: showId,
          type: mediaType,
        });

        startTransition(() => {
          setPendingTVNavigation({ showId, mediaType });
        });
      } else {
        logDebug("Navigating to media info:", {
          id: showId,
          type: mediaType,
        });

        router.push(
          {
            pathname: "/media-info/[id]",
            params: {
              id: showId,
              type: mediaType,
              ...(backdropUrl && { backdrop: backdropUrl }),
              ...(backdropBlurhash && { backdropBlurhash }),
            },
          },
          {
            dangerouslySingular: true,
          },
        );
      }
    },
    [router],
  );

  // Focus-aware background refresh
  useFocusEffect(
    useCallback(() => {
      if (!isFocused) {
        logDebug("Screen not focused - skipping refresh operations");
        return;
      }

      logDebug("Screen focused - refreshing genres data");

      if (genresData) {
        refetchGenres();
      }

      const backgroundTask = InteractionManager.runAfterInteractions(() => {
        setTimeout(() => {
          if (!isFocused) {
            logDebug("Screen lost focus during delay - canceling operations");
            return;
          }

          logDebug("Starting focus-aware background operations");
        }, 2000);
      });

      return () => {
        logDebug("Screen unfocused - canceling background operations");
        backgroundTask.cancel();
      };
    }, [isFocused, genresData, refetchGenres]),
  );

  return {
    // Data
    genresData,
    deferredGenresData,
    processedGenres,
    isLoadingGenres,
    genresError,

    // Functions
    handleSelectContent,
    transformMediaItems,
  };
}
