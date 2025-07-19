/**
 * Extracted movies page logic for code-splitting
 * Handles TV navigation, sidebar state, and data management
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
import { DeviceEventEmitter, InteractionManager } from "react-native";

import {
  MINIMIZED_WIDTH,
  EXPANDED_WIDTH,
} from "@/src/constants/SidebarConstants";
import { useTVAppState } from "@/src/context/TVAppStateContext";
import { useGenresList } from "@/src/data/hooks/queries/useContentQueries";
import { useRootShowData } from "@/src/data/hooks/useContent";
import { MediaItem } from "@/src/data/types/content.types";

export function useMoviesPageLogic() {
  const { currentMode, setMode } = useTVAppState();
  const router = useRouter();
  const isFocused = useIsFocused();

  // Conditional logging for performance optimization
  const DEBUG_MOVIES_PAGE = __DEV__ && false;
  const logDebug = useCallback((message: string, data?: any) => {
    if (DEBUG_MOVIES_PAGE) {
      console.log(`[MoviesPage] ${message}`, data);
    }
  }, []);

  // State for tracking sidebar state changes via custom events
  const [sidebarState, setSidebarState] = useState<
    "closed" | "minimized" | "expanded"
  >("minimized");

  // Listen for sidebar state changes via custom events
  useEffect(() => {
    const handleSidebarStateChange = (
      state: "closed" | "minimized" | "expanded",
    ) => {
      setSidebarState(state);
    };

    const subscription = DeviceEventEmitter.addListener(
      "sidebarStateChange",
      handleSidebarStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, []);

  // Ensure we're in browse mode when this page loads
  useEffect(() => {
    if (currentMode !== "browse") {
      setMode("browse");
    }
  }, [currentMode, setMode]);

  // Calculate dynamic left margin based on sidebar state
  const getContentMarginLeft = useCallback(() => {
    switch (sidebarState) {
      case "closed":
        return 0;
      case "minimized":
        return MINIMIZED_WIDTH;
      case "expanded":
        return EXPANDED_WIDTH;
      default:
        return 0;
    }
  }, [sidebarState]);

  // Fetch available movie genres
  const {
    data: genresData,
    isLoading: isLoadingGenres,
    error: genresError,
    refetch: refetchGenres,
  } = useGenresList({
    type: "movie",
    includeCounts: true,
    isTVdevice: true,
  });

  // Defer large props to avoid blocking initial paint
  const deferredGenresData = useDeferredValue(genresData);

  // Additional deferred value for the filtered and processed genres
  const processedGenres = useDeferredValue(
    deferredGenresData?.availableGenres?.filter(
      (genre) => genre.movieCount && genre.movieCount > 0,
    ) || [],
  );

  // Shared transformation function to reduce code duplication
  const transformMediaItems = useCallback((items: MediaItem[]) => {
    return items.map((item) => {
      const uniqueId = item.id;

      return {
        id: uniqueId,
        title: item.title,
        description: `MOVIE • ${item.hdr || "HD"}`,
        thumbnailUrl: item.posterURL,
        thumbnailBlurhash: item.posterBlurhash || "",
        showId: item.id,
        seasonNumber: undefined,
        episodeNumber: undefined,
        mediaType: item.type as "movie" | "tv",
        videoLink: item.link,
        backdropUrl: item.backdrop,
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

      router.push({
        pathname: "/media-info/[id]",
        params: {
          id: showId,
          type: mediaType,
          season: firstAvailableSeason,
        },
      });

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

      router.push({
        pathname: "/media-info/[id]",
        params: {
          id: showId,
          type: mediaType,
          season: 1,
        },
      });

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

        router.push({
          pathname: "/watch/[id]",
          params: {
            id: showId,
            type: mediaType,
            season: seasonNumber,
            episode: episodeNumber,
            ...(backdropUrl && { backdrop: backdropUrl }),
            ...(backdropBlurhash && { backdropBlurhash }),
          },
        });
      } else if (mediaType === "tv") {
        logDebug("Querying available seasons for TV show:", {
          id: showId,
          type: mediaType,
        });

        startTransition(() => {
          setPendingTVNavigation({ showId, mediaType });
        });
      } else {
        logDebug("Navigating to movie media info:", {
          id: showId,
          type: mediaType,
        });

        router.push({
          pathname: "/media-info/[id]",
          params: {
            id: showId,
            type: mediaType,
            ...(backdropUrl && { backdrop: backdropUrl }),
            ...(backdropBlurhash && { backdropBlurhash }),
          },
        });
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
    getContentMarginLeft,

    // State
    sidebarState,
  };
}
