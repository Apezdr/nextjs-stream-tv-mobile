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
import { useDolbyVisionProfiles } from "@/src/hooks/useDolbyVisionProfiles";
import { useVideoFormatSupport } from "@/src/hooks/useVideoFormatSupport";
import { useQualityPreferencesStore } from "@/src/stores/qualityPreferencesStore";
import { getPlatformClass } from "@/src/utils/deviceInfo";
import {
  DeviceDecodeCapabilities,
  QualityTierId,
  QualityTierOption,
  descentTierFor,
  resolveAvailableTiers,
  resolveInitialTier,
  resolveTierSourceURL,
  tierUsable,
} from "@/src/utils/qualityTiers";
import { applyResumePosition } from "@/src/utils/resumeGuard";
import {
  StreamVideoRange,
  canonicalVideoId,
  describeStreamTier,
} from "@/src/utils/streamUrls";
import { getDisplayHdrTypes } from "@/src/utils/videoDiagnostics";
import { videoFormatOf } from "@/src/utils/videoFormat";
import {
  dolbyVisionPreference,
  hasDolbyVisionPreference,
  nextRangeFallback,
  setSourcePolicy,
  videoSourceFor,
} from "@/src/utils/videoRange";

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

// How long a stored pinned preference waits for the device's decoder answer
// on the verdict's exact format once the verdict is in. The probe is a native
// round trip of a few milliseconds; the bound only guards a hung bridge.
const PROBE_WAIT_MS = 1500;

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
  /** The media payload's `playbackSource` (raw-served titles have no verdict). */
  playbackSource?: string | null;
  /**
   * The dynamic range to ask the ABR masters for (`?range=pq|sdr`), null for
   * the unfiltered master. Resolved per title by useVideoRange; the pinned
   * tiers never carry it.
   */
  videoRange?: StreamVideoRange | null;
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
  applyEpisodeSource: (
    masterURL: string,
    range?: StreamVideoRange | null,
  ) => string;
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
  /** True once an automatic descent happened this mount (menu shows why). */
  hasDescended: boolean;
  /**
   * Synchronous "a swap is in flight" read for listeners that must not act
   * mid-transition (the `isSwitching` state lags a render behind).
   */
  isBusy: () => boolean;
  /** The range the ABR masters currently ask for, after any downgrade. */
  activeVideoRange: StreamVideoRange | null;
  /**
   * The server refused the active master's range (406/400): re-open the
   * same tier at position one range down (pq → sdr → none). False when
   * nothing is left to ask for.
   */
  downgradeRange: () => Promise<boolean>;
  /**
   * Leave the Dolby Vision Original rung Auto was pinned to (the first step
   * of a descent from such a source): re-open the same master without the
   * DV preference so ABR runs the HEVC PQ ladder. False when none was set.
   */
  dropDolbyVisionPreference: () => Promise<boolean>;
}

export function useQualityTier({
  videoURL,
  directPlayInfo,
  mediaKey,
  isCellular = false,
  playerRef,
  notifySourceReplacedRef,
  playbackSource = null,
  videoRange = null,
}: Options): QualityTierController {
  const platformClass = useMemo(() => getPlatformClass(), []);
  // What the device's decoders advertise — the tier policy's device-side veto
  // over a served /file (Dolby Vision profile, MP4 index budget). Null until
  // the native probe answers; the policy only withholds on facts it has.
  const dolbyVisionProfiles = useDolbyVisionProfiles();
  const formatSupport = useVideoFormatSupport(directPlayInfo);
  const caps = useMemo<DeviceDecodeCapabilities>(
    () => ({
      dolbyVisionProfiles,
      fileVideoSupport: formatSupport.file,
      originalVideoSupport: formatSupport.original,
    }),
    [dolbyVisionProfiles, formatSupport.file, formatSupport.original],
  );
  const capsRef = useRef(caps);
  capsRef.current = caps;

  // The range the ABR masters ask for: the per-title resolution from the
  // screen, overridden once the server refuses one (downgradeRange). Refs,
  // because the async swaps read it after the render that set it.
  const videoRangeRef = useRef<StreamVideoRange | null>(videoRange);
  videoRangeRef.current = videoRange;
  const rangeOverrideRef = useRef<StreamVideoRange | null | undefined>(
    undefined,
  );
  const effectiveRange = useCallback(
    (): StreamVideoRange | null =>
      rangeOverrideRef.current !== undefined
        ? rangeOverrideRef.current
        : videoRangeRef.current,
    [],
  );

  // Dolby Vision under Auto: before a pq master is handed to the player,
  // register the DV preference for its URL when the verdict offers a DV
  // Original rung this display and decoder can take. Once a descent dropped
  // it for this item, it stays dropped until the item changes.
  const dvDroppedRef = useRef(false);
  const registerSourcePolicy = useCallback((url: string) => {
    const policy = dvDroppedRef.current
      ? null
      : dolbyVisionPreference({
          url,
          originalOffered: !!infoRef.current?.hls?.offered,
          supplementalCodecs: infoRef.current?.hls?.supplementalCodecs,
          dolbyVisionProfiles: capsRef.current.dolbyVisionProfiles,
          displayHdrTypes: getDisplayHdrTypes(),
        });
    setSourcePolicy(url, policy);
    if (policy) {
      console.log(
        `[useQualityTier] Preferring Dolby Vision on ${describeStreamTier(url)}`,
      );
    }
  }, []);

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
  // A pinned preference (Original, Direct Play) can only be honored against
  // the verdict, so wait for it (bounded); Auto and Transcoded only open
  // immediately.
  const needsVerdict =
    platformClass !== "web" &&
    !dataSaverActive &&
    (storedTier === "original" || storedTier === "directplay");
  const [verdictWaitExpired, setVerdictWaitExpired] = useState(false);
  useEffect(() => {
    if (!hasHydrated || !needsVerdict || directPlayInfo !== undefined) return;
    const timer = setTimeout(
      () => setVerdictWaitExpired(true),
      VERDICT_WAIT_MS,
    );
    return () => clearTimeout(timer);
  }, [hasHydrated, needsVerdict, directPlayInfo]);

  // A pinned preference is also gated on the device's decoder answer for
  // the verdict's exact format (DeviceDecodeCapabilities), so once the
  // verdict is in, wait for that answer too — bounded, like the verdict.
  const needsProbe = useMemo(() => {
    if (!needsVerdict || !directPlayInfo) return false;
    const specs = videoFormatOf(directPlayInfo);
    return !!specs.file || !!specs.original;
  }, [needsVerdict, directPlayInfo]);
  const probeAnswered = useMemo(() => {
    if (!directPlayInfo) return false;
    const specs = videoFormatOf(directPlayInfo);
    return (
      (!specs.file || formatSupport.file !== undefined) &&
      (!specs.original || formatSupport.original !== undefined)
    );
  }, [directPlayInfo, formatSupport.file, formatSupport.original]);
  const [probeWaitExpired, setProbeWaitExpired] = useState(false);
  useEffect(() => {
    if (!hasHydrated || !needsProbe || probeAnswered) return;
    const timer = setTimeout(() => setProbeWaitExpired(true), PROBE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [hasHydrated, needsProbe, probeAnswered]);

  const sourceReady =
    hasHydrated &&
    (!needsVerdict ||
      verdictWaitExpired ||
      (directPlayInfo !== undefined &&
        (!needsProbe || probeAnswered || probeWaitExpired)));

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
      caps,
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
      caps,
      effectiveRange(),
    );
    // The player builds its source from this URL in the same render.
    registerSourcePolicy(pinnedSourceRef.current);
  }
  const [overrideSourceURL, setOverrideSourceURL] = useState<string | null>(
    null,
  );
  const activeSourceURL = overrideSourceURL ?? pinnedSourceRef.current;

  // The canonical id of an item the engine pinned ahead of the loader's
  // `videoURL` (an episode switch): the catch-up effect must not chase the
  // stale prop back while it lasts.
  const pendingMasterRef = useRef<string | null>(null);

  const applyEpisodeSource = useCallback(
    (masterURL: string, range: StreamVideoRange | null = null): string => {
      // The verdict is per FILE — the previous episode's verdict cannot
      // authorize the next one's /file tier. Master-level tiers (Apple,
      // auto, transcode) carry over; Android "original" demotes to auto for
      // the new item until re-picked (or the next mount, where the
      // remembered preference re-resolves against that item's verdict).
      let tier = activeTierRef.current;
      if (tier === "original" || tier === "directplay") {
        tier = "auto";
        setSelectedTier("auto");
      }
      // A range refusal belonged to the previous item; the new one starts
      // from its own resolution.
      rangeOverrideRef.current = undefined;
      videoRangeRef.current = range;
      dvDroppedRef.current = false;
      pendingMasterRef.current = canonicalVideoId(masterURL);
      const target = resolveTierSourceURL(
        masterURL,
        tier,
        null,
        platformClass,
        null,
        range,
      );
      // No verdict for the new item yet, so no DV preference can apply here;
      // clearing keeps a stale one for a reused URL from leaking in.
      setSourcePolicy(target, null);
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
    if (!current) return;
    const currentId = canonicalVideoId(current);
    if (currentId === canonicalVideoId(videoURL)) {
      pendingMasterRef.current = null;
      return;
    }
    // An episode switch pinned the next item before the loader's videoURL
    // caught up: for a render or two the prop is still the OLD item, and
    // chasing it would flip the player back and forth. Wait for the prop.
    if (pendingMasterRef.current === currentId) return;
    applyEpisodeSource(videoURL, videoRangeRef.current);
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

  // The position-preserving source swap behind every in-session transition
  // (a tier pick, a descent, a withdrawn verdict, a range downgrade):
  // capture the position, swap, re-apply the audio track (Apple selection
  // is per-AVPlayerItem and dies with the old item), re-seek (tier and
  // range timelines are identical), resume, watchdog.
  const swapSource = useCallback(
    async (
      target: string,
      tier: QualityTierId,
      remember: boolean,
      label: string,
    ): Promise<boolean> => {
      if (switchBusyRef.current) return false;
      const player = playerRef.current;
      if (!player) return false;

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
          `[useQualityTier] ${label} at ${currentTime.toFixed(1)}s (player reported ${observed.toFixed(1)}s)`,
        );

        registerSourcePolicy(target);
        await player.replaceAsync(videoSourceFor(target));
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
        return true;
      } catch (error) {
        console.error("[useQualityTier] Source swap failed:", error);
        // Leave the previous tier state intact; the player still holds
        // whatever replaceAsync left it with, and the fallback hook's error
        // handling picks it up from here.
        return false;
      } finally {
        switchBusyRef.current = false;
        setIsSwitching(false);
      }
    },
    [mediaKey, rememberTier, clearWatchdog, registerSourcePolicy],
  );

  const selectTierInternal = useCallback(
    async (
      tier: QualityTierId,
      { remember = true }: { remember?: boolean } = {},
    ): Promise<void> => {
      if (switchBusyRef.current) return;
      const masterURL = videoURLRef.current;
      if (!playerRef.current || !masterURL) return;

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
        capsRef.current,
        effectiveRange(),
      );
      await swapSource(target, tier, remember, `Switching to "${tier}"`);
    },
    [mediaKey, platformClass, rememberTier, swapSource, effectiveRange],
  );

  // The server refused the range the active master asked for (406 nothing
  // left in that range, 400 invalid): step down pq → sdr → no range and
  // re-open the SAME tier at position. Nothing is remembered — the tier
  // preference stays the user's, and the range is per title anyway.
  const downgradeRange = useCallback(async (): Promise<boolean> => {
    const next = nextRangeFallback(effectiveRange());
    if (next === undefined) return false;
    const masterURL = videoURLRef.current;
    if (!masterURL) return false;
    rangeOverrideRef.current = next;
    const tier = activeTierRef.current;
    const target = resolveTierSourceURL(
      masterURL,
      tier,
      infoRef.current,
      platformClass,
      capsRef.current,
      next,
    );
    return swapSource(
      target,
      tier,
      false,
      `Range refused — reopening "${tier}" with ${next ? `range=${next}` : "no range"}`,
    );
  }, [platformClass, swapSource, effectiveRange]);

  // The active source URL as the swaps see it (state lags the swap).
  const activeSourceURLRef = useRef<string | null>(null);

  const dropDolbyVisionPreference = useCallback(async (): Promise<boolean> => {
    const url = activeSourceURLRef.current;
    if (!url || !hasDolbyVisionPreference(url)) return false;
    dvDroppedRef.current = true;
    setSourcePolicy(url, null);
    const swapped = await swapSource(
      url,
      activeTierRef.current,
      false,
      "Leaving the Dolby Vision rung — reopening the PQ ladder",
    );
    if (swapped) setHasDescended(true);
    return swapped;
  }, [swapSource]);

  const descendTierInternal = useCallback(async (): Promise<boolean> => {
    // A source pinned to the DV Original rung first falls back to the PQ
    // ladder of the same master; only then does the tier chain apply.
    if (await dropDolbyVisionPreference()) return true;
    const next = descentTierFor(
      activeTierRef.current,
      platformClass,
      infoRef.current,
      capsRef.current,
    );
    if (!next) return false;
    await selectTierInternal(next, { remember: false });
    setHasDescended(true);
    return true;
  }, [platformClass, selectTierInternal, dropDolbyVisionPreference]);
  descendRef.current = descendTierInternal;

  // A verdict that later withdraws a pinned tier (poisoned, a server rollback
  // surfacing as the 404 sentinel, a device veto once the probe answers)
  // demotes through the normal switch choreography — position-preserving —
  // instead of letting a re-derived URL restart playback from zero.
  useEffect(() => {
    if (activeTier !== "original" && activeTier !== "directplay") return;
    if (!directPlayInfo) return;
    if (tierUsable(activeTier, directPlayInfo, platformClass, caps)) return;
    console.warn(
      `[useQualityTier] Verdict withdrew the "${activeTier}" tier — demoting to auto`,
    );
    selectTierInternal("auto", { remember: false });
  }, [activeTier, directPlayInfo, platformClass, caps, selectTierInternal]);

  useEffect(() => clearWatchdog, [clearWatchdog]);

  // Stable identity matters: `tiers` is a prop of the memo-ized controls
  // components, and a fresh array here would defeat their memo on EVERY
  // watch-page render (remote presses, activity ticks), re-rendering the
  // whole controls tree — carousel, seek bar, focus guides — each time.
  const tiers = useMemo(
    () =>
      resolveAvailableTiers(
        directPlayInfo,
        platformClass,
        caps,
        playbackSource,
      ),
    [directPlayInfo, platformClass, caps, playbackSource],
  );

  activeSourceURLRef.current = activeSourceURL;

  return {
    sourceReady,
    activeSourceURL,
    positionHintRef,
    applyEpisodeSource,
    tiers,
    activeTier,
    selectTier: selectTierInternal,
    descendTier: descendTierInternal,
    descentTarget: descentTierFor(
      activeTier,
      platformClass,
      directPlayInfo,
      caps,
    ),
    isSwitching,
    hasDescended,
    isBusy: () => switchBusyRef.current,
    activeVideoRange: effectiveRange(),
    downgradeRange,
    dropDolbyVisionPreference,
  };
}
