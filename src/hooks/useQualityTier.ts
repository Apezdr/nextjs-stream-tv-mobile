// The shared tier-switch engine for both watch screens (TV + mobile) —
// delivery-tiers contract, FRONTEND_PLAYBACK_REQUIREMENTS.md §4-§6.
//
// Layering: this hook is called BEFORE useOptimizedVideoPlayer, because it
// decides the source URL the player mounts with (the player pins its first
// URL for the life of the mount). The player itself is only needed inside
// selectTier, so it arrives via refs the watch screen assigns after creating
// it — the same render-time ref-assignment idiom the error hooks use.
//
// In-session switches go through player.replaceAsync + notifySourceReplaced
// with the useAudioFallback.doFallback choreography: capture position, swap,
// re-apply the audio track (Apple selection is per-AVPlayerItem and dies with
// the old item), re-seek (tier timelines are identical), resume, watchdog.
import type { VideoPlayer } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DirectPlayInfo } from "@/src/data/types/directPlay.types";
import { useQualityPreferencesStore } from "@/src/stores/qualityPreferencesStore";
import { getPlatformClass } from "@/src/utils/deviceInfo";
import {
  QualityTierId,
  QualityTierOption,
  badgeLabel,
  descentTierFor,
  resolveAvailableTiers,
  resolveInitialTier,
  resolveTierSourceURL,
} from "@/src/utils/qualityTiers";
import { applyResumePosition } from "@/src/utils/resumeGuard";
import { canonicalVideoId } from "@/src/utils/streamUrls";

// How long an Android session holding a remembered "original" preference
// waits for the verdict before starting on Auto anyway. A remembered choice
// means the title played before, so the server-side verdict is memoized and
// normally arrives well inside this window; an un-memoized title must not
// hold playback hostage to minutes of keyframe derivation.
const VERDICT_WAIT_MS = 5000;

// If a switched-to source is still not playable this long after the swap,
// descend a tier (§8's "first attempt recovery, then drop a tier" policy for
// user-initiated switches).
const SWITCH_WATCHDOG_MS = 5000;

interface Options {
  /** Canonical master URL from the API (NOT a tier-mutated URL). */
  videoURL: string | null;
  directPlayInfo: DirectPlayInfo | null | undefined;
  /** Stable per-title key (qualityPrefMediaKey), null while unknown. */
  mediaKey: string | null;
  /** True on cellular (mobile screens); TV passes false. */
  isCellular?: boolean;
  playerRef: React.RefObject<VideoPlayer | null>;
  notifySourceReplacedRef: React.RefObject<
    ((url: string | null) => void) | null
  >;
}

export interface QualityTierController {
  /**
   * False until the initial tier can be resolved (preferences hydrated, plus
   * the bounded verdict wait). Watch screens must not create the player
   * before this is true.
   */
  sourceReady: boolean;
  /** The URL the player should hold right now for the active tier. */
  activeSourceURL: string | null;
  /**
   * Best-known playback position in seconds, for swaps that happen while the
   * player reports 0 (a resume seek still pending, an errored load). Fed by
   * useVideoTierFallback from timeUpdate events; read by selectTier so a
   * resumed session is never swapped back to the start.
   */
  positionHintRef: React.MutableRefObject<number>;
  /**
   * Resolve + pin the source for a NEW item's master URL (episode switch).
   * Master-level tiers carry over; Android "original" demotes to auto — the
   * old file's verdict cannot authorize the new file's /file tier.
   */
  applyEpisodeSource: (masterURL: string) => string;
  tiers: QualityTierOption[];
  activeTier: QualityTierId;
  /**
   * Switch tiers in place. User selections are remembered per title
   * (implicit remember-last-choice); pass remember: false for automatic
   * descents so a failure never rewrites the user's preference.
   */
  selectTier: (
    tier: QualityTierId,
    options?: { remember?: boolean },
  ) => Promise<void>;
  /**
   * §8 descent: drop to the next tier down at the current position. Returns
   * false when already at the bottom. Used by the decode-error fallback hook
   * and the switch watchdog.
   */
  descendTier: () => Promise<boolean>;
  /** Where a descent would land from the active tier; null at the bottom. */
  descentTarget: QualityTierId | null;
  isSwitching: boolean;
  /** "Original (Dolby Vision)" / "Original (HDR10)" / … or null. */
  badge: string | null;
  /** True once an automatic descent happened this mount (menu shows why). */
  hasDescended: boolean;
}

export function useQualityTier({
  videoURL,
  directPlayInfo,
  mediaKey,
  isCellular = false,
  playerRef,
  notifySourceReplacedRef,
}: Options): QualityTierController {
  const platformClass = useMemo(() => getPlatformClass(), []);

  const hasHydrated = useQualityPreferencesStore((s) => s.hasHydrated);
  const globalDefault = useQualityPreferencesStore((s) => s.globalDefault);
  const rememberedTier = useQualityPreferencesStore((s) =>
    mediaKey ? s.rememberedTiers[mediaKey] : undefined,
  );
  const cellularDataSaver = useQualityPreferencesStore(
    (s) => s.cellularDataSaver,
  );
  const rememberTier = useQualityPreferencesStore((s) => s.rememberTier);

  const storedTier = rememberedTier ?? globalDefault;
  const dataSaverActive = isCellular && cellularDataSaver;

  // Android + stored "original": worth a short wait for the verdict, since
  // honoring the preference needs file.available. Everything else resolves
  // from the preference alone.
  const needsVerdict =
    (platformClass === "android" || platformClass === "android-tv") &&
    !dataSaverActive &&
    storedTier === "original";
  const [verdictWaitExpired, setVerdictWaitExpired] = useState(false);
  useEffect(() => {
    if (!hasHydrated || !needsVerdict || directPlayInfo !== undefined) return;
    const timer = setTimeout(
      () => setVerdictWaitExpired(true),
      VERDICT_WAIT_MS,
    );
    return () => clearTimeout(timer);
  }, [hasHydrated, needsVerdict, directPlayInfo]);

  const sourceReady =
    hasHydrated &&
    (!needsVerdict || directPlayInfo !== undefined || verdictWaitExpired);

  // Freeze the initial tier at the first sourceReady render — the same
  // pin-once idiom as useOptimizedVideoPlayer's pinnedSourceRef. A verdict
  // (or preference) arriving later must not silently reload the source; only
  // selectTier changes tiers after this point.
  const initialTierRef = useRef<QualityTierId | null>(null);
  if (initialTierRef.current === null && sourceReady) {
    initialTierRef.current = resolveInitialTier(
      storedTier,
      directPlayInfo,
      dataSaverActive,
      platformClass,
    );
  }

  const [selectedTier, setSelectedTier] = useState<QualityTierId | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [hasDescended, setHasDescended] = useState(false);
  const activeTier: QualityTierId =
    selectedTier ?? initialTierRef.current ?? "auto";

  // Refs so the async selectTier and its watchdog always read current values.
  const activeTierRef = useRef(activeTier);
  activeTierRef.current = activeTier;
  const videoURLRef = useRef(videoURL);
  videoURLRef.current = videoURL;
  const infoRef = useRef(directPlayInfo);
  infoRef.current = directPlayInfo;
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchBusyRef = useRef(false);
  // Breaks the selectTier ↔ descendTier mutual reference (the watchdog inside
  // selectTier descends; descending is a selectTier call).
  const descendRef = useRef<() => Promise<boolean>>(async () => false);

  // Pin the resolved SOURCE, not just the tier. Deriving the URL live from
  // the verdict was a bug: on Android's "original" tier the resolved URL
  // depends on file.available, so a verdict refetch (foreground refetch, a
  // 404 after a server rollback, an episode switch's stale verdict) would
  // flip the derived URL and useOptimizedVideoPlayer's drift effect would
  // replaceAsync it bare — restarting playback at zero with no seek or
  // audio-track re-apply. The URL now changes only through explicit engine
  // transitions: this pin, selectTier, applyEpisodeSource, and the
  // withdrawn-verdict demotion below (which goes through selectTier's
  // position-preserving choreography).
  const pinnedSourceRef = useRef<string | null>(null);
  if (
    pinnedSourceRef.current === null &&
    sourceReady &&
    videoURL &&
    initialTierRef.current !== null
  ) {
    pinnedSourceRef.current = resolveTierSourceURL(
      videoURL,
      initialTierRef.current,
      directPlayInfo,
      platformClass,
    );
  }
  const [overrideSourceURL, setOverrideSourceURL] = useState<string | null>(
    null,
  );
  const activeSourceURL = overrideSourceURL ?? pinnedSourceRef.current;

  const applyEpisodeSource = useCallback(
    (masterURL: string): string => {
      // The verdict is per FILE — the previous episode's verdict cannot
      // authorize the next one's /file tier. Master-level tiers (Apple,
      // auto, transcode) carry over; Android "original" demotes to auto for
      // the new item until re-picked (or the next mount, where the
      // remembered preference re-resolves against that item's verdict).
      let tier = activeTierRef.current;
      if (tier === "original") {
        tier = "auto";
        setSelectedTier("auto");
      }
      const target = resolveTierSourceURL(masterURL, tier, null, platformClass);
      setOverrideSourceURL(target);
      return target;
    },
    [platformClass],
  );

  // Catch-up for a videoURL that changed outside the engine's transitions —
  // the post-switch loader refetch, or a server-side URL rotation. Re-derive
  // with master-level semantics (never re-reading the verdict) so the drift
  // effect replaces to a URL the server currently serves.
  useEffect(() => {
    if (!sourceReady || !videoURL) return;
    const current = overrideSourceURL ?? pinnedSourceRef.current;
    if (!current || canonicalVideoId(current) === canonicalVideoId(videoURL)) {
      return;
    }
    applyEpisodeSource(videoURL);
  }, [sourceReady, videoURL, overrideSourceURL, applyEpisodeSource]);

  const positionHintRef = useRef(0);

  // Disposer of the resume guard armed by the last swap (see resumeGuard).
  const resumeGuardRef = useRef<(() => void) | null>(null);
  useEffect(() => () => resumeGuardRef.current?.(), []);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const selectTierInternal = useCallback(
    async (
      tier: QualityTierId,
      { remember = true }: { remember?: boolean } = {},
    ): Promise<void> => {
      if (switchBusyRef.current) return;
      const player = playerRef.current;
      const masterURL = videoURLRef.current;
      if (!player || !masterURL) return;

      if (tier === activeTierRef.current) {
        // Still record an explicit re-selection as the remembered choice —
        // picking "Auto" after a descent must stick for next time.
        if (remember && mediaKey) rememberTier(mediaKey, tier);
        return;
      }

      const target = resolveTierSourceURL(
        masterURL,
        tier,
        infoRef.current,
        platformClass,
      );

      switchBusyRef.current = true;
      setIsSwitching(true);
      clearWatchdog();
      try {
        // A player that has not reached ready (a resume seek still pending, an
        // errored load) reports 0 even though the session has a position; fall
        // back to the last position the fallback hook observed.
        const observed = player.currentTime || 0;
        const currentTime = observed > 0 ? observed : positionHintRef.current;
        const audioTrack = player.audioTrack;
        console.log(
          `[useQualityTier] Switching to "${tier}" at ${currentTime.toFixed(1)}s (player reported ${observed.toFixed(1)}s)`,
        );

        await player.replaceAsync({ uri: target });
        notifySourceReplacedRef.current?.(target);

        // Apple audio selection is per-AVPlayerItem — re-apply on the new
        // item (harmless on Android, where the override is player-level).
        if (audioTrack) player.audioTrack = audioTrack;

        // Tier timelines are identical (§4), so this is a seek-free resume in
        // spirit — restore the position and keep going.
        if (currentTime > 0) {
          resumeGuardRef.current?.();
          resumeGuardRef.current = applyResumePosition(
            player,
            currentTime,
            "useQualityTier",
          );
        }
        player.play();

        setSelectedTier(tier);
        setOverrideSourceURL(target);
        if (remember && mediaKey) rememberTier(mediaKey, tier);

        // Watchdog: a source that never becomes playable descends a tier
        // instead of freezing (§8 policy for user-initiated switches).
        watchdogRef.current = setTimeout(() => {
          const p = playerRef.current;
          if (p && (p.status === "error" || p.status === "idle")) {
            console.warn(
              `[useQualityTier] Tier "${tier}" not playable after ${SWITCH_WATCHDOG_MS}ms — descending`,
            );
            descendRef.current();
          }
        }, SWITCH_WATCHDOG_MS);
      } catch (error) {
        console.error("[useQualityTier] Tier switch failed:", error);
        // Leave the previous tier state intact; the player still holds
        // whatever replaceAsync left it with, and the fallback hook's error
        // handling picks it up from here.
      } finally {
        switchBusyRef.current = false;
        setIsSwitching(false);
      }
    },
    [mediaKey, platformClass, rememberTier, clearWatchdog],
  );

  const descendTierInternal = useCallback(async (): Promise<boolean> => {
    const next = descentTierFor(activeTierRef.current, platformClass);
    if (!next) return false;
    await selectTierInternal(next, { remember: false });
    setHasDescended(true);
    return true;
  }, [platformClass, selectTierInternal]);
  descendRef.current = descendTierInternal;

  // A verdict that later withdraws the file tier (poisoned, or a server
  // rollback surfacing as the 404 sentinel) demotes through the normal
  // switch choreography — position-preserving — instead of letting a
  // re-derived URL restart playback from zero.
  useEffect(() => {
    if (activeTier !== "original") return;
    if (!directPlayInfo || directPlayInfo.file?.available) return;
    console.warn(
      "[useQualityTier] Verdict withdrew the file tier — demoting to auto",
    );
    selectTierInternal("auto", { remember: false });
  }, [activeTier, directPlayInfo, selectTierInternal]);

  useEffect(() => clearWatchdog, [clearWatchdog]);

  // Stable identity matters: `tiers` is a prop of the memo-ized controls
  // components, and a fresh array here would defeat their memo on EVERY
  // watch-page render (remote presses, activity ticks), re-rendering the
  // whole controls tree — carousel, seek bar, focus guides — each time.
  const tiers = useMemo(
    () => resolveAvailableTiers(directPlayInfo, platformClass),
    [directPlayInfo, platformClass],
  );

  return {
    sourceReady,
    activeSourceURL,
    positionHintRef,
    applyEpisodeSource,
    tiers,
    activeTier,
    selectTier: selectTierInternal,
    descendTier: descendTierInternal,
    descentTarget: descentTierFor(activeTier, platformClass),
    isSwitching,
    badge: badgeLabel(directPlayInfo),
    hasDescended,
  };
}
