// src/context/TVAppStateContext.tsx
import { router } from "expo-router";
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { TextInput } from "react-native";

import { contentService } from "@/src/data/services/contentService";

// Types for the TV app modes
export type TVAppMode = "browse" | "watch" | "media-info" | "screensaver";

// Player state interface
export interface VideoPlayerState {
  isPlaying: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  error: Error | null;
}

// Player controls interface
export interface VideoPlayerControls {
  play: () => void;
  pause: () => void;
  seekTo: (time: number) => void;
  skipForward: () => void;
  skipBackward: () => void;
  togglePlayPause: () => void;
}

// Types for video content
export interface VideoContent {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  logo?: string;
  backdrop?: string;
  metadata?: object;
  videoURL: string;
  showId?: string;
  seasonId?: string;
  episodeId?: string;
  mediaType?: "tv" | "movie";
  duration?: number;
  captionURLs?: {
    [language: string]: {
      srcLang: string;
      url: string;
      lastModified?: string;
      sourceServerId?: string;
    };
  }; // Keyed by language code, e.g. { "English": { ... } }
}

// Types for sidebar state (only relevant in browse mode)
export type SidebarState = "closed" | "minimized" | "expanded";

// Define a type for focusable elements
export type FocusableElement = React.ComponentRef<typeof TextInput> | null;

// Context interface
interface TVAppStateContextType {
  // App mode
  currentMode: TVAppMode;
  setMode: (mode: TVAppMode) => void;

  // Video content
  currentVideo: VideoContent | null;

  // Player state (read-only from components)
  playerState: VideoPlayerState;

  // Player controls (null when no player active)
  playerControls: VideoPlayerControls | null;

  // Player controls registration
  registerPlayerControls: (controls: VideoPlayerControls) => void;
  unregisterPlayerControls: () => void;
  updatePlayerState: (state: Partial<VideoPlayerState>) => void;

  // Sidebar state (browse mode only)
  sidebarState: SidebarState;
  setSidebarState: (state: SidebarState) => void;
  toggleSidebar: () => void;
  expandSidebar: () => void;
  collapseSidebar: () => void;
  closeSidebar: () => void;
  isSidebarVisible: boolean;

  // Focus restoration
  previouslyFocusedElement: FocusableElement;
  setPreviouslyFocusedElement: (element: FocusableElement) => void;
  restorePreviousFocus: () => void;

  // Actions
  selectContentAndWatch: (
    mediaId: string,
    mediaType: "tv" | "movie",
    seasonId?: string,
    episodeId?: string,
  ) => Promise<void>;
  playContent: () => void;
  pauseContent: () => void;
  togglePlayPause: () => void;
  exitWatchMode: () => void;

  // Seek and skip functions
  seekTo: (time: number) => void;
  skipBackward: () => void;
  skipForward: () => void;
}

// Create the context
const TVAppStateContext = createContext<TVAppStateContextType | null>(null);

// Custom hook to use the context
export const useTVAppState = () => {
  const context = useContext(TVAppStateContext);
  if (!context) {
    throw new Error("useTVAppState must be used within a TVAppStateProvider");
  }
  return context;
};

// Props for the provider
interface TVAppStateProviderProps {
  children: ReactNode;
}

// Main provider component
export const TVAppStateProvider: React.FC<TVAppStateProviderProps> = ({
  children,
}) => {
  const renderCount = useRef(0);
  renderCount.current += 1;
  console.log(`🏗️ TVAppStateProvider RENDER #${renderCount.current}`);
  // App mode state
  const [currentMode, setCurrentMode] = useState<TVAppMode>("browse");

  // Video content state
  const [currentVideo, setCurrentVideo] = useState<VideoContent | null>(null);

  // Sidebar state (only used in browse mode)
  const [sidebarState, setSidebarState] = useState<SidebarState>("minimized");

  // Focus restoration
  const [previouslyFocusedElement, setPreviouslyFocusedElement] =
    useState<FocusableElement>(null);
  const restorePreviousFocus = useCallback(() => {
    if (previouslyFocusedElement && previouslyFocusedElement.focus) {
      console.log("Restoring focus to previous element");
      setTimeout(() => {
        previouslyFocusedElement.focus();
      }, 100);
    }
  }, [previouslyFocusedElement]);

  // Player state
  const [playerState, setPlayerState] = useState<VideoPlayerState>({
    isPlaying: false,
    isMuted: false,
    currentTime: 0,
    duration: 0,
    error: null,
  });

  // Player controls (null when no player active)
  const [playerControls, setPlayerControls] =
    useState<VideoPlayerControls | null>(null);

  // Check if sidebar is visible
  const isSidebarVisible = sidebarState !== "closed";

  // Player controls registration
  const registerPlayerControls = useCallback(
    (controls: VideoPlayerControls) => {
      console.log("Registering player controls");
      setPlayerControls(controls);
    },
    [],
  );

  const unregisterPlayerControls = useCallback(() => {
    console.log("Unregistering player controls");
    setPlayerControls(null);
  }, []);

  // Player state update with throttling to reduce frequency
  const updatePlayerStateRef = useRef<NodeJS.Timeout | null>(null);
  const updatePlayerState = useCallback((state: Partial<VideoPlayerState>) => {
    // Clear any pending update
    if (updatePlayerStateRef.current) {
      clearTimeout(updatePlayerStateRef.current);
    }

    // For critical updates (errors, playing state), update immediately
    const isCritical =
      state.error !== undefined || state.isPlaying !== undefined;

    if (isCritical) {
      setPlayerState((prevState) => ({
        ...prevState,
        ...state,
      }));
    } else {
      // Throttle non-critical updates (like currentTime) to reduce re-renders
      updatePlayerStateRef.current = setTimeout(() => {
        setPlayerState((prevState) => {
          // Only update if values actually changed
          const newState = { ...prevState, ...state };
          const hasChanges = Object.keys(state).some(
            (key) =>
              prevState[key as keyof VideoPlayerState] !==
              newState[key as keyof VideoPlayerState],
          );

          return hasChanges ? newState : prevState;
        });
      }, 250); // 250ms throttle for time updates
    }
  }, []);

  // Cleanup throttle on unmount
  useEffect(() => {
    return () => {
      if (updatePlayerStateRef.current) {
        clearTimeout(updatePlayerStateRef.current);
      }
    };
  }, []);

  // Mode management
  const setMode = useCallback((mode: TVAppMode) => {
    setCurrentMode((prevMode) => {
      console.log(`Switching TV app mode from ${prevMode} to ${mode}`);
      return mode;
    });

    // Auto-close sidebar when entering watch mode
    if (mode === "watch") {
      setSidebarState("closed");
    } else if (mode === "browse") {
      // Open sidebar to minimized when returning to browse mode
      setSidebarState("minimized");
    } else if (mode === "media-info") {
      // Keep sidebar closed in media-info mode
      setSidebarState("closed");
    }
  }, []); // Remove currentMode dependency to prevent unnecessary re-renders

  // Sidebar controls
  const toggleSidebar = useCallback(() => {
    setSidebarState((prev) => {
      if (prev === "closed") return "minimized";
      if (prev === "minimized") return "expanded";
      return "minimized"; // If expanded, go back to minimized
    });
  }, []);

  const expandSidebar = useCallback(() => {
    setSidebarState("expanded");
  }, []);

  const collapseSidebar = useCallback(() => {
    setSidebarState("minimized");
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarState("closed");
  }, []);

  // Content selection and watch mode
  const selectContentAndWatch = useCallback(
    async (
      mediaId: string,
      mediaType: "tv" | "movie",
      seasonId?: string,
      episodeId?: string,
    ) => {
      try {
        console.log("Loading content for watch mode:", {
          mediaId,
          mediaType,
          seasonId,
          episodeId,
        });

        // Validate parameters
        if (mediaType === "tv" && (!seasonId || !episodeId)) {
          throw new Error("TV shows require seasonId and episodeId");
        }

        // Extract episode number for TV shows
        let episodeNumber: number | undefined;
        if (mediaType === "tv" && episodeId) {
          const match = episodeId.match(/E(\d+)/);
          if (match && match[1]) {
            episodeNumber = parseInt(match[1], 10);
          } else if (/^\d+$/.test(episodeId)) {
            // If episodeId is just a number
            episodeNumber = parseInt(episodeId, 10);
          }
        }

        // Prepare API parameters
        const apiParams: Parameters<typeof contentService.getMediaDetails>[0] =
          {
            mediaType,
            mediaId,
          };

        // Add season/episode for TV shows only
        if (mediaType === "tv" && seasonId) {
          apiParams.season = parseInt(seasonId, 10);
          apiParams.episode = episodeNumber || 1;
        }

        // Fetch media details from API
        const mediaDetails = await contentService.getMediaDetails(apiParams);

        if (!mediaDetails || !mediaDetails.videoURL) {
          throw new Error("Invalid media details returned from API");
        }

        // Create video content object
        let contentId: string;
        let description: string;

        if (mediaType === "movie") {
          contentId = mediaId;
          description = "Movie";
        } else {
          contentId = `${mediaId}-${seasonId}-${episodeId}`;
          description = `Season ${seasonId}, Episode ${episodeNumber || 1}`;
        }

        const videoContent: VideoContent = {
          ...mediaDetails,
          id: contentId,
          title: mediaDetails.title || "Unknown Title",
          description: mediaDetails.overview || description,
          thumbnailUrl: mediaDetails.posterURL,
          videoURL: mediaDetails.videoURL,
          mediaType,
          duration: mediaDetails.duration,
        };

        if (mediaType === "tv") {
          videoContent.showId = mediaId;
          videoContent.seasonId = seasonId || "0";
          videoContent.episodeId = episodeId || "";
        }

        // Set the current video - the player will pick this up
        setCurrentVideo(videoContent);

        // Switch to watch mode
        setMode("watch");
      } catch (error) {
        console.error("Failed to load content for watch mode:", error);
        throw error;
      }
    },
    [setMode],
  );

  // Helper methods that use playerControls if available
  const playContent = useCallback(() => {
    if (playerControls) {
      playerControls.play();
    }
  }, [playerControls]);

  const pauseContent = useCallback(() => {
    if (playerControls) {
      playerControls.pause();
    }
  }, [playerControls]);

  const togglePlayPause = useCallback(() => {
    if (playerControls) {
      playerControls.togglePlayPause();
    }
  }, [playerControls]);

  // Seek and skip functions
  const seekTo = useCallback(
    (time: number) => {
      if (playerControls) {
        playerControls.seekTo(time);
      }
    },
    [playerControls],
  );

  const skipBackward = useCallback(() => {
    if (playerControls) {
      playerControls.skipBackward();
    }
  }, [playerControls]);

  const skipForward = useCallback(() => {
    if (playerControls) {
      playerControls.skipForward();
    }
  }, [playerControls]);

  // Exit watch mode
  const exitWatchMode = useCallback(() => {
    console.log("Exiting watch mode");
    // Pause the video
    if (playerControls) {
      playerControls.pause();
    }
    // Switch back to browse mode
    setMode("browse");
    // Navigate back
    router.back();
  }, [playerControls, setMode]);

  // Memoized context value with stabilized functions to prevent unnecessary re-renders
  const value: TVAppStateContextType = useMemo(() => {
    console.log(
      `🏗️ TVAppStateContext: Creating new context value (render #${renderCount.current})`,
    );
    console.log("🏗️ TVAppStateContext: Context dependencies:", {
      currentMode,
      currentVideoId: currentVideo?.id,
      currentVideoURL: currentVideo?.videoURL
        ? currentVideo.videoURL.substring(0, 50) + "..."
        : null,
      currentVideoTitle: currentVideo?.title,
      playerStateIsPlaying: playerState.isPlaying,
      playerStateCurrentTime: playerState.currentTime,
      playerStateDuration: playerState.duration,
      playerStateError: !!playerState.error,
      hasPlayerControls: !!playerControls,
      sidebarState,
      isSidebarVisible,
    });

    return {
      currentMode,
      setMode,
      currentVideo,
      playerState,
      playerControls,
      sidebarState,
      setSidebarState,
      toggleSidebar,
      expandSidebar,
      collapseSidebar,
      closeSidebar,
      isSidebarVisible,
      previouslyFocusedElement,
      setPreviouslyFocusedElement,
      restorePreviousFocus,
      selectContentAndWatch,
      registerPlayerControls,
      unregisterPlayerControls,
      updatePlayerState,
      playContent,
      pauseContent,
      togglePlayPause,
      exitWatchMode,
      seekTo,
      skipBackward,
      skipForward,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally tracking only specific properties of currentVideo and playerState to prevent unnecessary re-renders
  }, [
    // Only include values that actually matter for consumers
    currentMode,
    currentVideo?.id, // Only track video ID changes, not the entire object
    currentVideo?.videoURL, // Only track URL changes
    currentVideo?.title, // Only track title changes
    // Removed playerState.isPlaying to prevent re-renders - screensaver uses direct communication
    playerState.currentTime, // Track time but this is throttled
    playerState.duration,
    playerState.error,
    playerControls, // This changes rarely
    sidebarState,
    isSidebarVisible,
    previouslyFocusedElement, // Need to track changes to focused element
    // Functions are stable due to useCallback
    setMode,
    setSidebarState,
    toggleSidebar,
    expandSidebar,
    collapseSidebar,
    closeSidebar,
    setPreviouslyFocusedElement,
    restorePreviousFocus,
    selectContentAndWatch,
    registerPlayerControls,
    unregisterPlayerControls,
    updatePlayerState,
    playContent,
    pauseContent,
    togglePlayPause,
    exitWatchMode,
    seekTo,
    skipBackward,
    skipForward,
  ]);

  return (
    <TVAppStateContext.Provider value={value}>
      {children}
    </TVAppStateContext.Provider>
  );
};
