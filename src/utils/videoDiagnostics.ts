import { requireOptionalNativeModule } from "expo-modules-core";
import { NativeModules, Platform } from "react-native";

import { reportClientError } from "@/src/data/services/errorReportingService";
import type {
  ClientErrorSeverity,
  PlaybackErrorDetails,
  SilentFailureDetails,
} from "@/src/data/types/clientError.types";
import { VideoFormatSpec, videoFormatKey } from "@/src/utils/videoFormat";

/**
 * Playback diagnostics for debugging codec/HLS failures on devices in the
 * wild (e.g. HEVC "incompatible codec" errors on Sony Bravia Android TVs).
 *
 * Collects three things into a single structured report:
 *  1. Device identity (model/brand/OS) from Platform.constants — on Android
 *     TV this includes the marketing model string like "BRAVIA 4K VH2".
 *  2. A decoder capability probe via react-native-video's
 *     VideoDecoderProperties (Android only), which asks MediaCodecList
 *     whether hardware/software decoders exist for each codec+resolution.
 *  3. The raw, unmodified player error message. On Android expo-video
 *     surfaces ExoPlayer's PlaybackException text, which names the exact
 *     failure (e.g. NO_EXCEEDS_CAPABILITIES, NO_UNSUPPORTED_TYPE) and the
 *     Format that failed (codecs=hvc1.2.4.L153, resolution, etc.).
 */

export interface CodecSupportEntry {
  mimeType: string;
  width: number;
  height: number;
  support: "hardware" | "software" | "unsupported" | "unknown";
}

export interface PlaybackErrorReport {
  platform: string;
  osVersion: string | number | null;
  isTV: boolean;
  device: Record<string, unknown>;
  videoURL: string | null;
  rawErrorMessage: string;
  playerStatus: string | null;
  codecSupport: CodecSupportEntry[];
}

// Codec/resolution combos worth probing. HEVC at both resolutions matters:
// some TV decoders report 1080p HEVC support but reject 4K (level caps).
const PROBE_TARGETS: { mimeType: string; width: number; height: number }[] = [
  { mimeType: "video/avc", width: 1920, height: 1080 },
  { mimeType: "video/avc", width: 3840, height: 2160 },
  { mimeType: "video/hevc", width: 1920, height: 1080 },
  { mimeType: "video/hevc", width: 3840, height: 2160 },
  { mimeType: "video/x-vnd.on2.vp9", width: 3840, height: 2160 },
  { mimeType: "video/av01", width: 3840, height: 2160 },
  { mimeType: "video/dolby-vision", width: 3840, height: 2160 },
];

let cachedProbe: CodecSupportEntry[] | null = null;

/**
 * Probe the device's decoder capabilities. Android only (iOS/tvOS handle
 * codec fallback via the AVFoundation HLS stack and don't expose this).
 * Results are cached — decoder capabilities are static for a device.
 *
 * Note: this reports codec+resolution support but NOT profile depth, so it
 * cannot distinguish HEVC Main (8-bit) from Main10 (10-bit). A device can
 * report "hardware" here and still fail on Main10 content.
 */
let cachedDolbyVisionProfiles: number[] | null | undefined;

/**
 * Dolby Vision profile numbers the device's decoders advertise (a SHIELD
 * reports 4, 5, 8 and 9). Null when unknown: not Android, an unpatched
 * react-native-video without the probe, or a failed query. Cached — decoder
 * capabilities are static for a device.
 */
export async function probeDolbyVisionProfiles(): Promise<number[] | null> {
  if (cachedDolbyVisionProfiles !== undefined) return cachedDolbyVisionProfiles;
  if (Platform.OS !== "android") {
    cachedDolbyVisionProfiles = null;
    return null;
  }
  try {
    const module = NativeModules.VideoDecoderInfoModule as
      { getDolbyVisionProfiles?: () => Promise<unknown> } | undefined;
    if (typeof module?.getDolbyVisionProfiles !== "function") {
      cachedDolbyVisionProfiles = null;
      return null;
    }
    const answer = await module.getDolbyVisionProfiles();
    cachedDolbyVisionProfiles = Array.isArray(answer)
      ? answer.filter((n): n is number => Number.isInteger(n))
      : null;
  } catch (error) {
    console.warn(
      "[VideoDiagnostics] Dolby Vision profile probe failed:",
      error,
    );
    cachedDolbyVisionProfiles = null;
  }
  return cachedDolbyVisionProfiles;
}

export async function probeCodecSupport(): Promise<CodecSupportEntry[]> {
  if (cachedProbe) return cachedProbe;
  if (Platform.OS !== "android") {
    cachedProbe = [];
    return cachedProbe;
  }

  let isCodecSupported:
    | ((mimeType: string, width: number, height: number) => Promise<string>)
    | undefined;
  try {
    // react-native-video is a project dependency (autolinked) even though the
    // player itself is expo-video; we only borrow its MediaCodecList bridge.
    const rnVideo = await import("react-native-video");
    isCodecSupported = rnVideo?.VideoDecoderProperties?.isCodecSupported;
  } catch (error) {
    console.warn(
      "[VideoDiagnostics] react-native-video unavailable, skipping codec probe:",
      error,
    );
  }

  if (!isCodecSupported) {
    cachedProbe = [];
    return cachedProbe;
  }

  const results: CodecSupportEntry[] = [];
  for (const target of PROBE_TARGETS) {
    let support: CodecSupportEntry["support"] = "unknown";
    try {
      const answer = await isCodecSupported(
        target.mimeType,
        target.width,
        target.height,
      );
      if (
        answer === "hardware" ||
        answer === "software" ||
        answer === "unsupported"
      ) {
        support = answer;
      }
    } catch {
      // Leave as "unknown" — a probe failure is itself a data point.
    }
    results.push({ ...target, support });
  }

  cachedProbe = results;
  return results;
}

function getDeviceInfo(): Record<string, unknown> {
  const constants = Platform.constants as Record<string, unknown>;
  if (Platform.OS === "android") {
    return {
      model: constants.Model,
      brand: constants.Brand,
      manufacturer: constants.Manufacturer,
      androidRelease: constants.Release,
      apiLevel: constants.Version,
      fingerprint: constants.Fingerprint,
    };
  }
  return {
    systemName: constants.systemName,
    osVersion: constants.osVersion,
    interfaceIdiom: constants.interfaceIdiom,
  };
}

export interface PlaybackErrorInput {
  rawErrorMessage: string;
  videoURL?: string | null;
  playerStatus?: string | null;
  /** Same UUID as the sync/updatePlayback heartbeats, when available. */
  playbackSessionId?: string | null;
  mediaId?: string | null;
  mediaType?: string | null;
  /** Set when this report records an automatic delivery-tier descent (§8). */
  tierDescent?: {
    from: string;
    to: string;
    position: number;
  };
  /**
   * A player statusChange error stopped playback: fatal (the default, and
   * what pages the admin). The silent-failure guard reports `error` or
   * `warning` instead — playback did not stop, it just showed nothing.
   */
  severity?: ClientErrorSeverity;
  /** Set when the silent-failure guard, not a player error, raised this. */
  silentFailure?: SilentFailureDetails;
}

export async function buildPlaybackErrorReport(
  input: PlaybackErrorInput,
): Promise<PlaybackErrorReport> {
  return {
    platform: Platform.OS,
    osVersion: Platform.Version ?? null,
    isTV: Platform.isTV,
    device: getDeviceInfo(),
    videoURL: input.videoURL ?? null,
    rawErrorMessage: input.rawErrorMessage,
    playerStatus: input.playerStatus ?? null,
    codecSupport: await probeCodecSupport(),
  };
}

/**
 * Build and emit a full playback error report: logged to the console
 * (visible via `adb logcat` / Metro) AND sent to the connected server's
 * client-error endpoint (fire-and-forget, deduped per session — see
 * docs/client-error-reporting-contract.md).
 */
export async function logPlaybackError(
  input: PlaybackErrorInput,
): Promise<PlaybackErrorReport | null> {
  try {
    const report = await buildPlaybackErrorReport(input);
    console.error(
      "[VideoDiagnostics] Playback error report:",
      JSON.stringify(report, null, 2),
    );

    reportClientError({
      category: "playback",
      // A player statusChange error means playback stopped — fatal.
      severity: input.severity ?? "fatal",
      message: input.rawErrorMessage,
      dedupeContext: input.videoURL ?? "",
      details: {
        videoURL: report.videoURL,
        playerStatus: report.playerStatus,
        playbackSessionId: input.playbackSessionId ?? null,
        mediaId: input.mediaId ?? null,
        mediaType: input.mediaType ?? null,
        codecSupport: report.codecSupport,
        ...(input.tierDescent ? { tierDescent: input.tierDescent } : {}),
        ...(input.silentFailure ? { silentFailure: input.silentFailure } : {}),
      } satisfies PlaybackErrorDetails,
    });

    return report;
  } catch (error) {
    console.error(
      "[VideoDiagnostics] Failed to build playback error report:",
      error,
    );
    return null;
  }
}

export interface SilentPlaybackFailureInput {
  silentFailure: SilentFailureDetails;
  severity: ClientErrorSeverity;
  videoURL?: string | null;
  playerStatus?: string | null;
  playbackSessionId?: string | null;
  mediaId?: string | null;
  mediaType?: string | null;
  tierDescent?: PlaybackErrorInput["tierDescent"];
}

/**
 * The silent-failure guard's report: same envelope and device/decoder
 * context as a player error, a message that names what was listed, what
 * was selected and how long audio ran, and a severity below fatal because
 * playback did not stop — it showed nothing.
 */
export function logSilentPlaybackFailure(
  input: SilentPlaybackFailureInput,
): Promise<PlaybackErrorReport | null> {
  const f = input.silentFailure;
  const supported = f.videoTracks.filter((t) => t.isSupported !== false).length;
  const message =
    `Silent playback failure (${f.verdict}): ${f.videoTracks.length} video track(s) listed, ` +
    `${supported} supported, selected=${f.selectedVideoTrack ?? "none"}, ` +
    `audio ${f.audioTracks.length} listed, selected=${f.selectedAudioTrack ?? "none"}, ` +
    `firstFrame=${f.firstFrameSeen}, clock=${f.clockAdvancedSec.toFixed(1)}s, tier=${f.tier}`;
  return logPlaybackError({
    rawErrorMessage: message,
    severity: input.severity,
    silentFailure: f,
    videoURL: input.videoURL,
    playerStatus: input.playerStatus,
    playbackSessionId: input.playbackSessionId,
    mediaId: input.mediaId,
    mediaType: input.mediaType,
    tierDescent: input.tierDescent,
  });
}

// ─── Exact decoder question + display HDR (expo-video patch, Android) ─────────

/**
 * Whether this device can decode one specific video format. "exceeds" means
 * decoders exist for the codec but none accepts this profile/level, size or
 * rate; "unsupported" means there is no decoder at all (the case media3
 * handles by leaving the track unselected, silently). "unknown" means the
 * question could not be asked: not Android, an unpatched runtime, or a
 * format with no MIME type.
 */
export type VideoFormatSupport =
  "hardware" | "software" | "exceeds" | "unsupported" | "unknown";

interface ExpoVideoNativeExtras {
  isVideoFormatSupported?: (
    mimeType: string | null,
    codecs: string | null,
    width: number,
    height: number,
    frameRate: number,
  ) => Promise<{ support?: unknown } | null>;
  getDisplayHdrTypes?: () => unknown;
}

// The patched expo-video module adds two functions; a stock binary lacks
// them, which every caller treats as "unknown" (same contract as the Dolby
// Vision probe above).
function expoVideoNative(): ExpoVideoNativeExtras | null {
  if (Platform.OS !== "android") return null;
  try {
    return requireOptionalNativeModule<ExpoVideoNativeExtras>("ExpoVideo");
  } catch {
    return null;
  }
}

const formatSupportCache = new Map<string, Promise<VideoFormatSupport>>();

function isFormatSupportAnswer(value: unknown): value is VideoFormatSupport {
  return (
    value === "hardware" ||
    value === "software" ||
    value === "exceeds" ||
    value === "unsupported" ||
    value === "unknown"
  );
}

/**
 * Ask the device about one exact video format. Prefers the patched
 * expo-video probe (media3's own MediaCodecInfo.isFormatSupported, so the
 * answer matches what the player will do), falls back to react-native-video's
 * MIME + size check on an unpatched runtime, and answers "unknown" when
 * neither can be asked. Cached per format; never throws.
 */
export function probeVideoFormatSupport(
  spec: VideoFormatSpec,
): Promise<VideoFormatSupport> {
  if (Platform.OS !== "android") return Promise.resolve("unknown");
  const key = videoFormatKey(spec);
  const cached = formatSupportCache.get(key);
  if (cached) return cached;
  const pending = (async (): Promise<VideoFormatSupport> => {
    try {
      const exact = expoVideoNative()?.isVideoFormatSupported;
      if (typeof exact === "function") {
        const answer = await exact(
          spec.mimeType,
          spec.codecs,
          spec.width ?? 0,
          spec.height ?? 0,
          spec.frameRate ?? 0,
        );
        const support = answer?.support;
        if (isFormatSupportAnswer(support)) {
          console.log(
            `[VideoDiagnostics] Exact format probe ${key}: ${support}` +
              (answer && "decoder" in answer
                ? ` (${String((answer as { decoder?: unknown }).decoder ?? "-")})`
                : ""),
          );
          return support;
        }
      }
      // Unpatched runtime: MIME + size only (no profile/level/frame rate).
      const rnVideo = await import("react-native-video");
      const isCodecSupported =
        rnVideo?.VideoDecoderProperties?.isCodecSupported;
      if (typeof isCodecSupported !== "function") return "unknown";
      const answer = await isCodecSupported(
        spec.mimeType,
        spec.width || 1920,
        spec.height || 1080,
      );
      console.log(
        `[VideoDiagnostics] MIME/size format probe ${key}: ${answer}`,
      );
      return answer === "hardware" ||
        answer === "software" ||
        answer === "unsupported"
        ? answer
        : "unknown";
    } catch (error) {
      console.warn("[VideoDiagnostics] Format probe failed:", error);
      return "unknown";
    }
  })();
  formatSupportCache.set(key, pending);
  return pending;
}

let cachedDisplayHdrTypes: number[] | null | undefined;

/**
 * Android's Display.HdrCapabilities types for the default display (1 Dolby
 * Vision, 2 HDR10, 3 HLG, 4 HDR10+), or null when unknown: not Android, or
 * a runtime without the patched expo-video function. Cached — a TV's panel
 * does not change under the app.
 */
export function getDisplayHdrTypes(): number[] | null {
  if (cachedDisplayHdrTypes !== undefined) return cachedDisplayHdrTypes;
  let result: number[] | null = null;
  try {
    const fn = expoVideoNative()?.getDisplayHdrTypes;
    if (typeof fn === "function") {
      const answer = fn();
      result = Array.isArray(answer)
        ? answer.filter((n): n is number => Number.isInteger(n))
        : null;
    }
  } catch (error) {
    console.warn("[VideoDiagnostics] Display HDR probe failed:", error);
    result = null;
  }
  cachedDisplayHdrTypes = result;
  return result;
}
