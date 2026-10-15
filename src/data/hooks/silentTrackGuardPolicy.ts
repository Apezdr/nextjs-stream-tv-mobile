// The silent-failure guard's decision, kept pure so it can be unit-tested
// without a player. media3 raises no error when a track has no decoder: it
// leaves the track unselected and plays what remains, so a raw file whose
// video the device cannot decode plays audio over a black screen and none of
// the error-driven watchdogs fire. This module says, from a snapshot of what
// the player reports, whether that is happening and what to do about it.
//
// Every threshold is measured in PLAYBACK clock, not wall-clock: only
// bounded positive timeUpdate deltas count, so a pause, a rebuffer, a seek,
// a resume jump or time in the background adds nothing, and a verdict can
// only form while audio (or the clock) is demonstrably running.
import type {
  SilentFailureAction,
  SilentFailureVerdict,
} from "@/src/data/types/clientError.types";
import type { PlatformClass } from "@/src/utils/deviceInfo";

export const VIDEO_UNSUPPORTED_AFTER_S = 3;
export const VIDEO_UNSELECTED_REPORT_AFTER_S = 6;
export const VIDEO_NOT_RENDERING_AFTER_S = 8;
export const AUDIO_RETRY_AFTER_S = 3;
export const AUDIO_UNSELECTED_AFTER_S = 6;
/** A timeUpdate step above this is a seek or a resume, not playback. */
export const CLOCK_MAX_STEP_S = 2.5;

export interface SilentGuardVideoTrack {
  id: string | null;
  mimeType: string | null;
  /** media3's per-track support flag; null when the platform cannot say. */
  isSupported: boolean | null;
}

export interface SilentGuardAudioTrack {
  id: string | null;
  isSupported: boolean | null;
}

export interface SilentGuardSnapshot {
  platformClass: PlatformClass;
  appActive: boolean;
  inPictureInPicture: boolean;
  /** The VideoView is mounted (first-frame events only reach a mounted view). */
  viewMounted: boolean;
  status: string;
  playing: boolean;
  isSwitching: boolean;
  isHandlingError: boolean;
  clockAdvancedSec: number;
  firstFrameSeen: boolean;
  videoTracks: SilentGuardVideoTrack[];
  videoTrackSelected: boolean;
  audioTracks: SilentGuardAudioTrack[];
  audioTrackSelected: boolean;
  audioRetryDone: boolean;
  alreadyDecided: ReadonlySet<SilentFailureVerdict>;
}

export interface SilentFailureDecision {
  verdict: SilentFailureVerdict;
  action: SilentFailureAction;
}

/**
 * The playback-clock increment a timeUpdate contributes: its positive
 * delta from the previous time, or 0 for the first sample, a negative
 * delta (a seek back) or a jump larger than `maxStepSec` (a seek or resume).
 */
export function accumulateClock(
  prev: number | null,
  next: number,
  maxStepSec: number = CLOCK_MAX_STEP_S,
): number {
  if (prev === null || !Number.isFinite(prev) || !Number.isFinite(next)) {
    return 0;
  }
  const delta = next - prev;
  if (delta <= 0 || delta > maxStepSec) return 0;
  return delta;
}

function isAndroid(platformClass: PlatformClass): boolean {
  return platformClass === "android" || platformClass === "android-tv";
}

/**
 * What the guard should do now, or null for "nothing": no verdict forms
 * unless the app is in front, the view is mounted, the player is ready and
 * playing, nothing else is swapping the source, and the clock has run long
 * enough. Each verdict is returned once per source (`alreadyDecided`).
 */
export function decideSilentFailure(
  s: SilentGuardSnapshot,
): SilentFailureDecision | null {
  if (
    !s.appActive ||
    s.inPictureInPicture ||
    !s.viewMounted ||
    s.status !== "readyToPlay" ||
    !s.playing ||
    s.isSwitching ||
    s.isHandlingError
  ) {
    return null;
  }
  if (s.platformClass === "web") return null;
  const android = isAndroid(s.platformClass);
  const clock = s.clockAdvancedSec;

  // ── Video: tracks are listed, nothing has been drawn ────────────────────
  if (s.videoTracks.length > 0 && !s.firstFrameSeen) {
    const allUnsupported = s.videoTracks.every((t) => t.isSupported === false);

    // Every listed track is one media3 has no decoder for: the raw-file
    // case. Three seconds of audio with no frame is already conclusive.
    if (
      android &&
      allUnsupported &&
      clock >= VIDEO_UNSUPPORTED_AFTER_S &&
      !s.alreadyDecided.has("video-unsupported")
    ) {
      return { verdict: "video-unsupported", action: "descend-or-card" };
    }

    // Nothing drawn for a long stretch of running clock. Android acts only
    // with BOTH signals missing: no first frame and no video track. The
    // patched expo-video reports a track whenever the decoder has an input
    // format (matched to the listed rung from the playing chunk's playlist
    // format, or described from the input format itself when nothing listed
    // matches), so a null track after eight seconds of playback means the
    // renderer never received video. Before that fix a Dolby Vision rung
    // played through OMX.Nvidia.DOVI.decode with the track unmatched, and
    // acting put the error card over a working picture. Apple has only the
    // first-frame signal, so it stays report-only there.
    if (
      clock >= VIDEO_NOT_RENDERING_AFTER_S &&
      (!android || !s.videoTrackSelected) &&
      !s.alreadyDecided.has("video-not-rendering")
    ) {
      return {
        verdict: "video-not-rendering",
        action: android ? "descend-or-card" : "report-only",
      };
    }

    // Supported tracks are listed but none was selected: unexpected, so it
    // is reported for telemetry first and only acted on by the rule above.
    if (
      android &&
      !allUnsupported &&
      !s.videoTrackSelected &&
      clock >= VIDEO_UNSELECTED_REPORT_AFTER_S &&
      !s.alreadyDecided.has("video-unselected")
    ) {
      return { verdict: "video-unselected", action: "report-only" };
    }
  }

  // ── Audio: tracks are listed, none is selected ──────────────────────────
  if (android && s.audioTracks.length > 0 && !s.audioTrackSelected) {
    if (!s.audioRetryDone && clock >= AUDIO_RETRY_AFTER_S) {
      return { verdict: "audio-unselected", action: "audio-retry" };
    }
    if (
      s.audioRetryDone &&
      clock >= AUDIO_UNSELECTED_AFTER_S &&
      !s.alreadyDecided.has("audio-unselected")
    ) {
      return { verdict: "audio-unselected", action: "descend-or-card" };
    }
  }

  return null;
}
