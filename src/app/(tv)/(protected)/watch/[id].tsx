// src/app/(tv)/(protected)/watch/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState, useMemo, useCallback } from "react";
import { View, StyleSheet, Text, BackHandler, Pressable } from "react-native";

import StandaloneVideoControls from "@/src/components/Video/StandaloneVideoControls";
import { Colors } from "@/src/constants/Colors";
import { useRemoteActivity } from "@/src/context/RemoteActivityContext";
import { useScreensaver } from "@/src/context/ScreensaverContext";
import { useTVAppState } from "@/src/context/TVAppStateContext";
import { useAudioFallback } from "@/src/data/hooks/useAudioFallback";
import { setWatchMode, tvQueryHelpers } from "@/src/data/query/queryClient";
import { contentService } from "@/src/data/services/contentService";

function parseNumericParam(value: string | undefined): number | undefined {
  if (!value || value === "") return undefined;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? undefined : parsed;
}

// Custom hook to handle content loading logic
function useContentLoader(params: {
  id: string;
  type: "tv" | "movie";
  season?: string;
  episode?: string;
}) {
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!params.id || !params.type) return;

      setLoading(true);
      setContentError(null);

      try {
        const md = await contentService.getMediaDetails({
          mediaType: params.type,
          mediaId: params.id,
          season: parseNumericParam(params.season),
          episode: params.episode
            ? parseNumericParam(params.episode.match(/\d+/)?.[0])
            : undefined,
        });

        if (!cancelled) {
          setVideoURL(md?.videoURL ?? null);
          setVideoData(md ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          setContentError(
            error instanceof Error ? error.message : "Failed to load content",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.id, params.type, params.season, params.episode]);

  return {
    videoURL,
    videoData,
    loading,
    contentError,
  };
}

export default function WatchPage() {
  const params = useLocalSearchParams<{
    id: string;
    type: "tv" | "movie";
    season?: string;
    episode?: string;
  }>();
  const router = useRouter();

  // App contexts
  const { setMode } = useTVAppState();
  const { resetActivityTimer } = useRemoteActivity();
  const { setVideoPlayingState } = useScreensaver();

  // Content loading (abstracted)
  const { videoURL, videoData, loading, contentError } =
    useContentLoader(params);

  // Create player
  const player = useVideoPlayer(videoURL, (p) => {
    p.timeUpdateEventInterval = 1;
    p.loop = false;
    p.play();
  });

  // Handle audio‐codec errors and fallback
  const audioError = useAudioFallback({
    videoURL,
    player,
    preferredLanguages: ["en"],
    fallbackTimeoutMs: 5000,
  });

  // Combine content and audio errors
  const finalError = contentError || audioError;

  // Tell the app we're in "watch" mode and optimize queries for video playback
  useEffect(() => {
    console.log(
      "[WatchPage] Entering watch mode - suspending background queries",
    );

    // Set TV app state to watch mode
    setMode("watch");

    // Enable React Query watch mode optimizations
    setWatchMode(true);

    // Suspend background queries and clear browse cache to free memory
    tvQueryHelpers.suspendBackgroundQueries();
    tvQueryHelpers.clearBrowseCache();

    return () => {
      console.log(
        "[WatchPage] Exiting watch mode - resuming background queries",
      );

      // Restore normal mode
      setMode("browse");
      setWatchMode(false);

      // Resume background queries
      tvQueryHelpers.resumeBackgroundQueries();
    };
  }, [setMode]);

  // Back handler
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setMode("browse");
      router.back();
      return true;
    });
    return () => sub.remove();
  }, [router, setMode]);

  // Screensaver sync
  useEffect(() => {
    const sub = player.addListener("playingChange", ({ isPlaying }) => {
      setVideoPlayingState(isPlaying);
    });
    return () => sub.remove();
  }, [player, setVideoPlayingState]);

  const handleExit = useCallback(() => {
    resetActivityTimer();
    setMode("browse");
    router.back();
  }, [resetActivityTimer, setMode, router]);

  const videoInfo = useMemo(
    () =>
      videoData
        ? {
            type: videoData.type,
            title: videoData.title,
            description: videoData.metadata.overview,
            logo: videoData.logo,
            captionURLs: videoData.captionURLs,
            backdrop: videoData.backdrop,
            showTitle: videoData.showTitle,
          }
        : undefined,
    [videoData],
  );

  // Render
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.messageContainer}>
          <Text style={[styles.messageText, styles.clickableText]}>
            Loading video...
          </Text>
        </View>
      </View>
    );
  }
  if (finalError) {
    return (
      <View style={styles.container}>
        <View style={styles.messageContainer}>
          <Text style={styles.errorText}>Error: {finalError}</Text>
          <Pressable
            focusable
            hasTVPreferredFocus
            style={({ focused }) => [
              styles.clickableText,
              focused && styles.clickableTextFocused,
            ]}
            onPress={handleExit}
          >
            <Text style={styles.messageText}>Go back to browse</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (!videoURL || !player) {
    return (
      <View style={styles.container}>
        <View style={styles.messageContainer}>
          <Text style={styles.errorText}>No video content loaded.</Text>
          <Pressable
            focusable
            hasTVPreferredFocus
            style={({ focused }) => [
              styles.clickableText,
              focused && styles.clickableTextFocused,
            ]}
            onPress={handleExit}
          >
            <Text style={styles.messageText}>Go back to browse</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VideoView
        style={styles.video}
        player={player}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        nativeControls={false}
      />
      <StandaloneVideoControls
        player={player}
        videoInfo={videoInfo}
        overlayMode
        onExitWatchMode={handleExit}
        showCaptionControls={!!videoInfo?.captionURLs}
      />
    </View>
  );
}

// (You’d define CenteredMessage and CenteredError as tiny helpers)

const styles = StyleSheet.create({
  clickableText: {
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: 8,
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  clickableTextFocused: {
    backgroundColor: Colors.dark.tint,
    borderColor: "#FFFFFF",
    borderWidth: 2,
  },
  container: {
    backgroundColor: "#000000",
    flex: 1,
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 18,
    marginBottom: 20,
    textAlign: "center",
  },
  messageContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  messageText: {
    color: "#FFFFFF",
    fontSize: 18,
    marginBottom: 10,
    textAlign: "center",
  },
  video: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 0, // Behind controls
  },
});
