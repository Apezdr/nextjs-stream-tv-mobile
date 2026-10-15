// Which dynamic range to ask the transcoder for, and how the answer shapes
// the native player source. The `range` query control selects a master
// whose variants share one dynamic range (`?range=pq` | `?range=sdr`,
// transcoder feature `master-video-range-filter-v1`), which is what makes
// cross-codec ABR safe: media3 has no colour-range compatibility check of
// its own, so mixed-MIME adaptation may only be switched on for a master the
// server has already filtered to SDR.
import type { VideoSourceObject } from "expo-video";

import { STREAM_FEATURE_RANGE_FILTER } from "@/src/data/types/content.types";
import { PlatformClass, playerUserAgent } from "@/src/utils/deviceInfo";
import {
  StreamVideoRange,
  isDirectOnlyURL,
  isFileTierURL,
  rangeParamOf,
} from "@/src/utils/streamUrls";

/** Android Display.HdrCapabilities types. */
export const HDR_TYPE_DOLBY_VISION = 1;
export const HDR_TYPE_HDR10 = 2;
export const HDR_TYPE_HLG = 3;
export const HDR_TYPE_HDR10_PLUS = 4;

export function parseDimensions(
  value: string | null | undefined,
): { width: number; height: number } | null {
  const match = (value ?? "").trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!match) return null;
  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The transcoder builds PQ rungs only for 4K-class sources (its rule:
 * width ≥ 3600, height ≥ 2160 or ≥ 6.5 Mpx); a smaller HDR source answers
 * `?range=pq` with 406.
 */
export function isFourKClass(
  dims: { width: number; height: number } | null,
): boolean {
  if (!dims) return false;
  return (
    dims.width >= 3600 ||
    dims.height >= 2160 ||
    dims.width * dims.height >= 6_500_000
  );
}

/** The agreed PQ test: the transfer characteristic, not the HDR label. */
export function isPQTransfer(value: string | null | undefined): boolean {
  const tc = (value ?? "").trim();
  return /^pq$/i.test(tc) || /smpte\s*2084/i.test(tc);
}

/** Whether the display shows HDR10-class content; null when unknown. */
export function hdr10Capable(
  types: number[] | null | undefined,
): boolean | null {
  if (!types) return null;
  return types.some(
    (t) =>
      t === HDR_TYPE_HDR10 ||
      t === HDR_TYPE_DOLBY_VISION ||
      t === HDR_TYPE_HDR10_PLUS,
  );
}

export interface ResolveVideoRangeInput {
  /** The "HDR and 4K Auto" preference; off means today's unfiltered master. */
  enabled: boolean;
  streamFeatures: string[] | null | undefined;
  transferCharacteristics: string | null | undefined;
  dimensions: string | null | undefined;
  platformClass: PlatformClass;
  /** `getDisplayHdrTypes()`; null on a runtime that cannot say. */
  displayHdrTypes: number[] | null | undefined;
}

/**
 * The range to request for this title on this device, or null for the
 * unfiltered master (older server, feature off, non-Android, or an HDR
 * source on a runtime that cannot yet say whether the display is HDR —
 * better the mixed master than stripping the PQ rungs from HDR viewers).
 */
export function resolveVideoRange(
  input: ResolveVideoRangeInput,
): StreamVideoRange | null {
  if (!input.enabled) return null;
  if (
    input.platformClass !== "android" &&
    input.platformClass !== "android-tv"
  ) {
    return null;
  }
  if (!input.streamFeatures?.includes(STREAM_FEATURE_RANGE_FILTER)) {
    return null;
  }
  if (!isPQTransfer(input.transferCharacteristics)) return "sdr";
  if (!isFourKClass(parseDimensions(input.dimensions))) return "sdr";
  const capable = hdr10Capable(input.displayHdrTypes);
  if (capable === null) return null;
  return capable ? "pq" : "sdr";
}

/**
 * The next range to try after the server refused one: pq → sdr → no range.
 * `undefined` means there is nothing left to try.
 */
export function nextRangeFallback(
  current: StreamVideoRange | null,
): StreamVideoRange | null | undefined {
  if (current === "pq") return "sdr";
  if (current === "sdr") return null;
  return undefined;
}

// media3's message for a refused master, as the patched expo-video spells it:
// "… Response code: 406 [ERROR_CODE_IO_BAD_HTTP_STATUS] …". 406 is the
// transcoder's range_unavailable, 400 its invalid-range; both are
// negotiation answers, never worth retrying the same URL.
const RANGE_REFUSAL_RE = /Response code: (406|400)\b/;

/**
 * "downgrade" when a player error is the server refusing the `range` the
 * master asked for; null for every other error and for URLs without a range.
 */
export function rangeNegotiationFailure(
  url: string | null | undefined,
  message: string,
): "downgrade" | null {
  if (!rangeParamOf(url)) return null;
  return RANGE_REFUSAL_RE.test(message) ? "downgrade" : null;
}

/** The source object the app hands expo-video, with the native extras. */
export type AppVideoSource = VideoSourceObject & {
  allowMixedCodecAdaptation?: boolean;
  preferredVideoMimeTypes?: string[];
};

export interface SourcePolicy {
  preferredVideoMimeTypes?: string[];
}

// Per-URL policy the tier engine registers for the source it is about to
// open (Dolby Vision preference on a pq master). Module-level so every
// replaceAsync site builds the same source for the same URL.
const sourcePolicies = new Map<string, SourcePolicy>();

export function setSourcePolicy(
  url: string,
  policy: SourcePolicy | null,
): void {
  if (policy && Object.keys(policy).length > 0) sourcePolicies.set(url, policy);
  else sourcePolicies.delete(url);
}

export function sourcePolicyFor(url: string): SourcePolicy | null {
  return sourcePolicies.get(url) ?? null;
}

/**
 * Mixed-codec adaptation is allowed on exactly one kind of URL: an SDR
 * filtered master. Never on `pq` (it may carry a Dolby Vision rung with its
 * own MIME, and HEVC-PQ → DV mid-stream is an HDMI mode switch), never on an
 * unfiltered master (SDR and PQ rungs together), never on the pinned tiers.
 */
export function allowsMixedCodecAdaptation(url: string): boolean {
  return (
    rangeParamOf(url) === "sdr" && !isDirectOnlyURL(url) && !isFileTierURL(url)
  );
}

/**
 * The player source for a URL. Byte-identical to today's `{ uri }` for
 * every URL that carries no policy, so banner clips and unfiltered masters
 * reach the native side unchanged; an old binary drops the extra keys.
 */
export function videoSourceFor(url: string): AppVideoSource {
  const source: AppVideoSource = { uri: url };
  // On Android the player's default agent cannot tell devices apart in the
  // transcoder's log; name the device (deviceInfo.playerUserAgent).
  const userAgent = playerUserAgent();
  if (userAgent) source.headers = { "User-Agent": userAgent };
  if (allowsMixedCodecAdaptation(url)) source.allowMixedCodecAdaptation = true;
  const policy = sourcePolicyFor(url);
  if (policy?.preferredVideoMimeTypes?.length) {
    source.preferredVideoMimeTypes = [...policy.preferredVideoMimeTypes];
  }
  return source;
}

/** True when the engine registered a Dolby Vision preference for this URL. */
export function hasDolbyVisionPreference(
  url: string | null | undefined,
): boolean {
  if (!url) return false;
  return !!sourcePolicyFor(url)?.preferredVideoMimeTypes?.includes(
    "video/dolby-vision",
  );
}

/** The profile number in a DV codec string: "dvh1.08.06" → 8, "dvhe.05.06" → 5. */
export function dolbyVisionProfileOf(
  supplementalCodecs: string | null | undefined,
): number | null {
  const first = (supplementalCodecs ?? "").split(",")[0]?.trim() ?? "";
  const match = first.match(/^dv(?:h1|he|a1|av)\.(\d{2})/i);
  if (!match) return null;
  const profile = parseInt(match[1], 10);
  return Number.isFinite(profile) ? profile : null;
}

export interface DolbyVisionPreferenceInput {
  url: string;
  /** `hls.offered` and `hls.supplementalCodecs` of the verdict. */
  originalOffered: boolean;
  supplementalCodecs: string | null | undefined;
  /** The decoders' advertised DV profiles; null until probed. */
  dolbyVisionProfiles: number[] | null | undefined;
  /** `getDisplayHdrTypes()`; null when unknown. */
  displayHdrTypes: number[] | null | undefined;
}

/**
 * Dolby Vision under Auto: on a `pq` master that carries a DV Original rung,
 * on a display that shows DV, with a decoder that advertises the rung's
 * profile, prefer the DV MIME type. media3 then picks the single DV rung
 * (a non-quality preference outranks the rung count) and never adapts out of
 * it, since mixed-codec adaptation stays off on pq masters — so the TV
 * switches to DV once and stays. Null everywhere else.
 */
export function dolbyVisionPreference(
  input: DolbyVisionPreferenceInput,
): SourcePolicy | null {
  if (rangeParamOf(input.url) !== "pq") return null;
  if (isDirectOnlyURL(input.url) || isFileTierURL(input.url)) return null;
  if (!input.originalOffered) return null;
  const profile = dolbyVisionProfileOf(input.supplementalCodecs);
  if (profile === null) return null;
  if (!input.displayHdrTypes?.includes(HDR_TYPE_DOLBY_VISION)) return null;
  if (!input.dolbyVisionProfiles?.includes(profile)) return null;
  return { preferredVideoMimeTypes: ["video/dolby-vision"] };
}
