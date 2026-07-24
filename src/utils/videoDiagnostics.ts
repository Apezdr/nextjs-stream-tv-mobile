import { Platform } from "react-native";

import { reportClientError } from "@/src/data/services/errorReportingService";
import type { PlaybackErrorDetails } from "@/src/data/types/clientError.types";

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
      severity: "fatal",
      message: input.rawErrorMessage,
      dedupeContext: input.videoURL ?? "",
      details: {
        videoURL: report.videoURL,
        playerStatus: report.playerStatus,
        playbackSessionId: input.playbackSessionId ?? null,
        mediaId: input.mediaId ?? null,
        mediaType: input.mediaType ?? null,
        codecSupport: report.codecSupport,
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
