import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { VideoView } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import MobileMiniPlayerOverlay from "./MobileMiniPlayerOverlay";
import MobileWatchDetails from "./MobileWatchDetails";

import MobileVideoControls, {
  MobileVideoControlsHandle,
  OptionAvailability,
} from "@/src/components/Mobile/Video/MobileVideoControls";
import { Colors } from "@/src/constants/Colors";
import { MOBILE_TAB_CONFIG } from "@/src/constants/MobileNavConstants";
import { useDimensions } from "@/src/hooks/useDimensions";
import { useMobilePlaybackSession } from "@/src/hooks/useMobilePlaybackSession";
import {
  MobilePlayerSession,
  useMobilePlayerStore,
} from "@/src/stores/mobilePlayerStore";
import {
  centeredVideoRect,
  clamp,
  type Rect,
  clampMiniOffset,
  dockedVideoRect,
  fullscreenVideoRect,
  interpolateVideoRect,
  isLandscape,
  type MiniOffset,
  miniPlayerBounds,
  miniPlayerHomeRect,
  minimizeProgressForDrag,
  shouldCommitTransition,
  snapMiniOffset,
  tabBarClearance,
  transformBetween,
} from "@/src/utils/mobilePlayerLayout";
import { navigationHelper } from "@/src/utils/navigationHelper";
import { isAdaptiveStreamURL } from "@/src/utils/streamType";
import { isFileTierURL } from "@/src/utils/streamUrls";

const SPRING = { damping: 26, stiffness: 240, mass: 0.9 };
// The mini player's settle after a drag: looser, so a fling overshoots its
// corner a little and bounces back, like a thrown object coming to rest.
const MINI_SETTLE_SPRING = { damping: 16, stiffness: 170, mass: 1 };
const TIMING = { duration: 240 };
const NO_OFFSET: MiniOffset = { dx: 0, dy: 0 };
const NO_OPTIONS: OptionAvailability = {
  captions: false,
  audio: false,
  quality: false,
};

interface MobileWatchSessionProps {
  session: MobilePlayerSession;
}

function placeholderSource(hash?: string | null) {
  if (!hash) return undefined;
  return {
    uri: hash.startsWith("data:") ? hash : `data:image/png;base64,${hash}`,
  };
}

/**
 * One playback session on screen: the video surface, its controls, and the
 * details panel, laid out for the store's presentation and dragged between
 * presentations with the finger.
 *
 * Two surfaces, and where a drag starts decides what moves:
 * - the VIDEO dragged down puts the player away (collapses to the mini
 *   player; the details fade out and the screens underneath come back);
 * - the TITLE STRIP beneath it dragged down moves the details out of the
 *   way (portrait fullscreen); a swipe up on the fullscreen video brings
 *   them back.
 * A tap on the mini player restores the watch page; a drag repositions it.
 * Landscape is always fullscreen, short of mini. Scrubbing and the control
 * buttons win over the drags; the episode list scrolls on its own and only
 * the strip above it is a handle, so the two never fight.
 *
 * The gesture's intent is locked when it starts: the video drag is a
 * minimize even once the finger is over the strip, because each handle
 * owns its own gesture detector.
 */
export default function MobileWatchSession({
  session,
}: MobileWatchSessionProps) {
  const presentation = useMobilePlayerStore((s) => s.presentation);
  const setPresentation = useMobilePlayerStore((s) => s.setPresentation);
  const closeSession = useMobilePlayerStore((s) => s.close);
  const switchEpisode = useMobilePlayerStore((s) => s.switchEpisode);

  const { window } = useDimensions();
  const insets = useSafeAreaInsets();
  const landscape = isLandscape(window);
  // What is actually on screen: landscape has no details surface, so its
  // watch presentation looks like fullscreen.
  const mode: "watch" | "fullscreen" | "mini" =
    presentation === "mini" ? "mini" : landscape ? "fullscreen" : presentation;
  const immersive = mode === "fullscreen";

  // Coming back from the system PiP window lands on the watch page: the
  // user left a full player and expects one back, and the page's own
  // surfaces are what they see while the screens underneath re-lay out
  // from the PiP window's size.
  const onPictureInPictureExpanded = useCallback(
    () => setPresentation("watch"),
    [setPresentation],
  );
  const playback = useMobilePlaybackSession(session, {
    onPictureInPictureExpanded,
  });
  const controlsRef = useRef<MobileVideoControlsHandle>(null);
  const [options, setOptions] = useState<OptionAvailability>(NO_OPTIONS);
  // Measured height of the title strip (it sits in the gesture layer, above
  // the panel, which pads its list down by this much).
  const [stripHeight, setStripHeight] = useState(0);
  // Where the mini player last came to rest (its home plus the settled drag
  // offset): the gesture layer is re-anchored there after every drag.
  const [miniRest, setMiniRest] = useState<MiniOffset>(NO_OFFSET);

  // ---- geometry -----------------------------------------------------------
  // The video surface has ONE layout rect per orientation (`base`): the
  // portrait strip, or the whole window in landscape. Every presentation is
  // a transform of it: a width-bound picture is already as large as
  // portrait allows, so fullscreen only centres the strip, and the mini
  // player is the same shape at a smaller scale. No transition re-lays out
  // the subtree that holds the SurfaceView — animating its layout rect made
  // the surface trail the view tree by a frame and jitter against the panel.
  const windowHeight = window.height;
  const full = useMemo(() => fullscreenVideoRect(window), [window]);
  const base = useMemo(
    () => (landscape ? full : dockedVideoRect(window, insets)),
    [landscape, full, window, insets],
  );
  const expanded = useMemo(
    () => (landscape ? base : centeredVideoRect(window, base)),
    [landscape, window, base],
  );
  const aspect = base.width / base.height;
  const clearance = tabBarClearance(insets, MOBILE_TAB_CONFIG.TAB_BAR_HEIGHT);
  const miniHome = useMemo(
    () => miniPlayerHomeRect(window, insets, clearance, aspect),
    [window, insets, clearance, aspect],
  );
  const miniBounds = useMemo(
    () => miniPlayerBounds(window, insets, clearance, aspect),
    [window, insets, clearance, aspect],
  );
  const panelTop = base.y + base.height;
  const panelHeight = Math.max(1, windowHeight - panelTop);
  // The GESTURE LAYER never moves while a drag is in flight. A drag handler
  // that lives inside the view it moves sees every move event in that
  // view's own (moving) coordinates, so as the panel followed the finger
  // the handler read the finger as moving back, the panel sprang back, and
  // the two oscillated — the "violent jitter" on a slow strip drag. This
  // layer is laid out once per settled presentation (and, for the mini
  // player, per rest position) and only its CONTENT is translated.
  const gestureRect = useMemo<Rect>(() => {
    if (mode === "mini") {
      return {
        x: miniHome.x + miniRest.dx,
        y: miniHome.y + miniRest.dy,
        width: miniHome.width,
        height: miniHome.height,
      };
    }
    if (mode === "fullscreen") return full;
    return {
      x: base.x,
      y: base.y,
      width: base.width,
      height: base.height + stripHeight,
    };
  }, [mode, miniHome, miniRest, full, base, stripHeight]);

  // ---- transition state (UI thread) ---------------------------------------
  // 0 = watch page, 1 = mini player.
  const minimize = useSharedValue(presentation === "mini" ? 1 : 0);
  // 0 = details beneath the video, 1 = details moved away.
  const fullscreen = useSharedValue(presentation === "fullscreen" ? 1 : 0);
  // Where the mini player has been dragged from its home.
  const miniDx = useSharedValue(0);
  const miniDy = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);

  // A presentation set by anything other than a completed drag (a button,
  // Back, a tap on the mini player, opening the same title again) animates
  // from wherever the values are.
  useEffect(() => {
    minimize.value = withSpring(presentation === "mini" ? 1 : 0, SPRING);
    fullscreen.value = withTiming(
      presentation === "fullscreen" ? 1 : 0,
      TIMING,
    );
    if (presentation !== "mini") {
      miniDx.value = withTiming(0, TIMING);
      miniDy.value = withTiming(0, TIMING);
      setMiniRest(NO_OFFSET);
    }
  }, [presentation, minimize, fullscreen, miniDx, miniDy]);

  const videoStyle = useAnimatedStyle(() => {
    const rect = interpolateVideoRect(
      base,
      expanded,
      miniHome,
      fullscreen.value,
      minimize.value,
    );
    const t = transformBetween(base, rect);
    return {
      transform: [
        { translateX: t.translateX + miniDx.value * minimize.value },
        { translateY: t.translateY + miniDy.value * minimize.value },
        { scale: t.scale },
      ],
    };
  });
  // The chrome fades out as a drag leaves the settled presentation and
  // comes back once the values reach the new one (it is re-laid out for
  // that presentation's rect in between).
  const minimizeTarget = presentation === "mini" ? 1 : 0;
  const fullscreenTarget = presentation === "fullscreen" ? 1 : 0;
  const chromeStyle = useAnimatedStyle(() => {
    const away = Math.max(
      Math.abs(minimize.value - minimizeTarget),
      Math.abs(fullscreen.value - fullscreenTarget),
    );
    return {
      opacity: 1 - clamp(away * 2, 0, 1),
      transform: [
        { translateX: miniDx.value * minimize.value - miniRest.dx },
        { translateY: miniDy.value * minimize.value - miniRest.dy },
      ],
    };
  });
  const panelStyle = useAnimatedStyle(() => {
    const away = Math.max(fullscreen.value, minimize.value);
    return {
      opacity: 1 - away,
      transform: [{ translateY: away * panelHeight }],
    };
  });
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: 1 - minimize.value,
  }));

  // ---- gestures -----------------------------------------------------------
  // Video dragged down: minimize. Vertical only; a sideways start fails it so
  // the seek bar's own pan and the double-tap zones keep working.
  const minimizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(12)
        .failOffsetY(-12)
        .failOffsetX([-28, 28])
        .onUpdate((e) => {
          minimize.value = minimizeProgressForDrag(
            e.translationY,
            windowHeight,
          );
        })
        .onEnd((e) => {
          if (shouldCommitTransition(minimize.value, e.velocityY)) {
            scheduleOnRN(setPresentation, "mini");
          } else {
            minimize.value = withSpring(0, SPRING);
          }
        }),
    [minimize, windowHeight, setPresentation],
  );

  // Fullscreen video swiped up: bring the details back.
  const restoreGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(-12)
        .failOffsetY(12)
        .failOffsetX([-28, 28])
        .onUpdate((e) => {
          fullscreen.value = 1 - clamp(-e.translationY / panelHeight, 0, 1);
        })
        .onEnd((e) => {
          if (shouldCommitTransition(1 - fullscreen.value, -e.velocityY)) {
            scheduleOnRN(setPresentation, "watch");
          } else {
            fullscreen.value = withTiming(1, TIMING);
          }
        }),
    [fullscreen, panelHeight, setPresentation],
  );

  // Mini player dragged: reposition within the safe bounds, settle on the
  // nearer side.
  const miniGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-8, 8])
        .activeOffsetY([-8, 8])
        .onStart(() => {
          dragStartX.value = miniDx.value;
          dragStartY.value = miniDy.value;
        })
        .onUpdate((e) => {
          const next = clampMiniOffset(
            {
              dx: dragStartX.value + e.translationX,
              dy: dragStartY.value + e.translationY,
            },
            miniHome,
            miniBounds,
          );
          miniDx.value = next.dx;
          miniDy.value = next.dy;
        })
        .onEnd((e) => {
          // Carry the fling: the corner is chosen from where the release
          // velocity would take it, and the spring starts at that velocity
          // so the window keeps moving and settles with a small bounce.
          const target = snapMiniOffset(
            { dx: miniDx.value, dy: miniDy.value },
            { x: e.velocityX, y: e.velocityY },
            miniHome,
            miniBounds,
          );
          scheduleOnRN(setMiniRest, target);
          miniDx.value = withSpring(target.dx, {
            ...MINI_SETTLE_SPRING,
            velocity: e.velocityX,
          });
          miniDy.value = withSpring(target.dy, {
            ...MINI_SETTLE_SPRING,
            velocity: e.velocityY,
          });
        }),
    [miniDx, miniDy, dragStartX, dragStartY, miniHome, miniBounds],
  );

  // Title strip dragged down: move the details away (portrait fullscreen).
  const stripGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(10)
        .failOffsetY(-10)
        .failOffsetX([-30, 30])
        .onUpdate((e) => {
          fullscreen.value = clamp(e.translationY / panelHeight, 0, 1);
        })
        .onEnd((e) => {
          if (shouldCommitTransition(fullscreen.value, e.velocityY)) {
            scheduleOnRN(setPresentation, "fullscreen");
          } else {
            fullscreen.value = withTiming(0, TIMING);
          }
        }),
    [fullscreen, panelHeight, setPresentation],
  );

  const videoGesture =
    mode === "mini"
      ? miniGesture
      : mode === "fullscreen" && !landscape
        ? restoreGesture
        : minimizeGesture;

  // ---- actions ------------------------------------------------------------
  const minimizeNow = useCallback(
    () => setPresentation("mini"),
    [setPresentation],
  );
  const expand = useCallback(() => setPresentation("watch"), [setPresentation]);
  const enterFullscreen = useCallback(
    () => setPresentation("fullscreen"),
    [setPresentation],
  );
  const toggleFullscreen = useCallback(
    () =>
      setPresentation(presentation === "fullscreen" ? "watch" : "fullscreen"),
    [presentation, setPresentation],
  );
  // The chrome's collapse button: in portrait fullscreen it brings the
  // details back; anywhere else (watch, landscape) it minimizes.
  const collapse = useCallback(() => {
    if (mode === "fullscreen" && !landscape) {
      setPresentation("watch");
    } else {
      setPresentation("mini");
    }
  }, [mode, landscape, setPresentation]);

  const close = useCallback(async () => {
    await playback.finish();
    closeSession();
  }, [playback, closeSession]);

  const openInfo = useCallback(() => {
    minimizeNow();
    navigationHelper.navigateToMediaInfo(
      {
        id: session.id,
        type: session.type,
        ...(session.season !== undefined && { season: session.season }),
      },
      false,
      true,
    );
  }, [minimizeNow, session.id, session.type, session.season]);

  const openEpisodeInfo = useCallback(
    (season: number, episode: number) => {
      minimizeNow();
      navigationHelper.navigateToEpisodeInfo({
        showId: session.id,
        season,
        episode,
      });
    },
    [minimizeNow, session.id],
  );

  const selectEpisode = useCallback(
    (season: number, episode: number, restart = false) => {
      switchEpisode(season, episode, restart);
    },
    [switchEpisode],
  );

  const openCaptions = useCallback(
    () => controlsRef.current?.openCaptionPicker(),
    [],
  );
  const openAudio = useCallback(
    () => controlsRef.current?.openAudioPicker(),
    [],
  );
  const openQuality = useCallback(
    () => controlsRef.current?.openQualityPicker(),
    [],
  );

  // Android Back: an open sheet closes itself first (RN Modal and the action
  // sheet claim the key before this listener), then fullscreen gives way to
  // the watch page, then the watch page minimizes. The mini player leaves
  // Back to the navigator.
  useEffect(() => {
    if (mode === "mini") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (mode === "fullscreen" && !landscape) {
        setPresentation("watch");
      } else {
        setPresentation("mini");
      }
      return true;
    });
    return () => sub.remove();
  }, [mode, landscape, setPresentation]);

  // ---- render -------------------------------------------------------------
  const showVideo = !playback.isLoading && !playback.error && !!playback.player;
  const backdrop = session.backdrop ?? playback.videoData?.backdrop;
  const backdropBlurhash =
    session.backdropBlurhash ??
    (playback.videoData?.backdropBlurhash as string | undefined);

  const isShow = session.type === "tv";
  const showTitle = playback.videoInfo?.showTitle;
  const episodeNumber = playback.videoData?.episodeNumber ?? session.episode;
  const seasonNumber = playback.videoData?.seasonNumber ?? session.season;
  const headline = isShow
    ? [
        seasonNumber !== undefined && episodeNumber !== undefined
          ? `S${String(seasonNumber).padStart(2, "0")} E${String(
              episodeNumber,
            ).padStart(2, "0")}`
          : null,
        playback.videoInfo?.title || null,
      ]
        .filter(Boolean)
        .join(" · ")
    : playback.videoInfo?.title || "";

  const titleStrip = (
    <View style={styles.strip}>
      <View style={styles.handle} />
      <View style={styles.stripRow}>
        <View style={styles.stripText}>
          {isShow && showTitle ? (
            <Text style={styles.showTitle} numberOfLines={1}>
              {showTitle}
            </Text>
          ) : null}
          <Text style={styles.title} numberOfLines={2}>
            {headline || (playback.isLoading ? "Loading…" : "")}
          </Text>
        </View>
        <Pressable
          style={styles.stripButton}
          onPress={enterFullscreen}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Hide details"
        >
          <Ionicons
            name="chevron-down"
            size={26}
            color="rgba(255, 255, 255, 0.85)"
          />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {immersive ? <SystemBars hidden style="light" /> : null}

      {/* The page's background. Gone when minimized so the screens
          underneath are the backdrop of the mini player. */}
      <Animated.View
        style={[styles.scrim, scrimStyle]}
        pointerEvents={mode === "mini" ? "none" : "auto"}
      />

      {/* The details surface (portrait only). The title strip above its
          list lives in the gesture layer and is translated with it. */}
      {!landscape ? (
        <Animated.View
          style={[
            styles.panel,
            { top: panelTop, height: panelHeight, paddingTop: stripHeight },
            panelStyle,
          ]}
          pointerEvents={mode === "watch" ? "auto" : "none"}
        >
          <MobileWatchDetails
            session={session}
            videoData={playback.videoData}
            options={options}
            qualityBadge={playback.qualityBadge}
            onOpenCaptions={openCaptions}
            onOpenAudio={openAudio}
            onOpenQuality={openQuality}
            onSelectEpisode={selectEpisode}
            onOpenEpisodeInfo={openEpisodeInfo}
            onOpenInfo={openInfo}
          />
        </Animated.View>
      ) : null}

      {/* The video surface: one mounted view at its base rect, transformed
          between the presentations' rectangles. Touches go to the gesture
          layer. */}
      <Animated.View
        style={[
          styles.videoLayer,
          {
            left: base.x,
            top: base.y,
            width: base.width,
            height: base.height,
          },
          videoStyle,
          mode === "mini" && styles.mini,
        ]}
        pointerEvents="none"
      >
        {showVideo && playback.player ? (
          <VideoView
            style={StyleSheet.absoluteFill}
            player={playback.player}
            contentFit="contain"
            fullscreenOptions={{ enable: false }}
            startsPictureInPictureAutomatically
            allowsPictureInPicture
            nativeControls={false}
            onPictureInPictureStart={playback.handlePiPStart}
            onPictureInPictureStop={playback.handlePiPStop}
            onFirstFrameRender={playback.silentGuard.onFirstFrameRender}
          />
        ) : null}

        {playback.isLoading ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {backdrop ? (
              <Image
                source={{ uri: backdrop }}
                placeholder={placeholderSource(backdropBlurhash)}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={200}
              />
            ) : null}
            <View style={styles.loadingShade}>
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          </View>
        ) : null}
      </Animated.View>

      {/* The gesture layer: static per settled presentation (see
          gestureRect). The chrome and the title strip move inside it. Its
          gesture root is only as big as this rect, so touches around the
          mini player fall through to the screens. */}
      <View
        style={[
          styles.gestureLayer,
          {
            left: gestureRect.x,
            top: gestureRect.y,
            width: gestureRect.width,
            height: gestureRect.height,
          },
        ]}
      >
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>
          <GestureDetector gesture={videoGesture}>
            <View
              style={
                mode === "watch"
                  ? { height: base.height, width: base.width }
                  : StyleSheet.absoluteFill
              }
            >
              <Animated.View style={[StyleSheet.absoluteFill, chromeStyle]}>
                {playback.error ? (
                  <View style={styles.errorCard}>
                    <Text style={styles.errorText} numberOfLines={4}>
                      {playback.error}
                    </Text>
                    <View style={styles.errorButtons}>
                      {playback.contentError ? (
                        <Pressable
                          style={styles.errorButton}
                          onPress={playback.retryContent}
                        >
                          <Text style={styles.errorButtonText}>Try again</Text>
                        </Pressable>
                      ) : playback.silentGuard.error ? (
                        <Pressable
                          style={styles.errorButton}
                          onPress={playback.silentGuard.retry}
                        >
                          <Text style={styles.errorButtonText}>Try again</Text>
                        </Pressable>
                      ) : null}
                      <Pressable style={styles.errorButton} onPress={close}>
                        <Text style={styles.errorButtonText}>Close</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {showVideo && playback.player ? (
                  <MobileVideoControls
                    ref={controlsRef}
                    player={playback.player}
                    videoInfo={playback.videoInfo}
                    variant={immersive ? "immersive" : "docked"}
                    hidden={mode === "mini"}
                    isFullscreen={mode === "fullscreen"}
                    onToggleFullscreen={
                      landscape ? undefined : toggleFullscreen
                    }
                    onExitWatchMode={collapse}
                    onInfoPress={openInfo}
                    onOptionAvailabilityChange={setOptions}
                    showCaptionControls={!!playback.videoInfo?.captionURLs}
                    showAudioControls={
                      isAdaptiveStreamURL(playback.playbackSourceURL) ||
                      isFileTierURL(playback.playbackSourceURL)
                    }
                    videoURL={playback.playbackSourceURL}
                    qualityTiers={playback.quality.tiers}
                    activeQualityTier={playback.quality.activeTier}
                    onSelectQualityTier={playback.quality.selectTier}
                    isQualitySwitching={playback.quality.isSwitching}
                    hasQualityDescended={playback.quality.hasDescended}
                    qualityBadge={playback.qualityBadge}
                  />
                ) : null}

                {mode === "mini" ? (
                  <MobileMiniPlayerOverlay
                    player={playback.player}
                    isLoading={playback.isLoading}
                    onExpand={expand}
                    onClose={close}
                  />
                ) : null}
              </Animated.View>
            </View>
          </GestureDetector>

          {mode === "watch" ? (
            <GestureDetector gesture={stripGesture}>
              <Animated.View
                style={panelStyle}
                onLayout={(e) => setStripHeight(e.nativeEvent.layout.height)}
              >
                {titleStrip}
              </Animated.View>
            </GestureDetector>
          ) : null}
        </GestureHandlerRootView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  errorButton: {
    backgroundColor: Colors.dark.brandPrimary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorButtonText: {
    color: Colors.dark.whiteText,
    fontSize: 14,
    fontWeight: "600",
  },
  errorButtons: {
    flexDirection: "row",
    gap: 12,
  },
  errorCard: {
    alignItems: "center",
    backgroundColor: "#000000",
    bottom: 0,
    gap: 14,
    justifyContent: "center",
    left: 0,
    padding: 16,
    position: "absolute",
    right: 0,
    top: 0,
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 15,
    textAlign: "center",
  },
  gestureLayer: {
    position: "absolute",
  },
  handle: {
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    height: 4,
    marginBottom: 10,
    width: 36,
  },
  loadingShade: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  mini: {
    elevation: 14,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  panel: {
    backgroundColor: "#121214",
    left: 0,
    position: "absolute",
    right: 0,
  },
  scrim: {
    backgroundColor: "#0b0b0d",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  showTitle: {
    color: "#A8A8AD",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.5,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  strip: {
    paddingBottom: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  stripButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  stripRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  stripText: {
    flex: 1,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  videoLayer: {
    backgroundColor: "#000000",
    overflow: "hidden",
    position: "absolute",
  },
});
