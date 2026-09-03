// Display facts and per-platform tier options for the delivery-tiers contract
// (FRONTEND_PLAYBACK_REQUIREMENTS.md §3-§6, §11). The server's enriched
// verdict fields (badgeLabel/reasonCopy) are the primary source; the pure
// functions here are the client-side fallback so a thin proxy still renders
// correctly. Source policy itself (which tier maps to which URL) is inherently
// app-local and lives here.
//
// Four tiers:
//   auto        `?direct=1` master — ABR across the ladder AND the Original
//               rung when it is offered. The default.
//   original    `?direct=only` master — the Original rung pinned (one
//               variant, nothing to adapt to), server-picked audio. No ABR.
//   directplay  `/file` — the untouched container, every original track,
//               Android only, subject to the device-side vetoes below.
//   transcode   default master — the ladder only. The opt-out.
import { DirectPlayInfo } from "@/src/data/types/directPlay.types";
import { PlatformClass } from "@/src/utils/deviceInfo";
import {
  fileURL,
  stripDirectParam,
  withDirectOnlyParam,
  withDirectParam,
} from "@/src/utils/streamUrls";

function isApple(platformClass: PlatformClass): boolean {
  return platformClass === "apple-tv" || platformClass === "ios";
}

function isAndroid(platformClass: PlatformClass): boolean {
  return platformClass === "android" || platformClass === "android-tv";
}

/**
 * What the device's decoders advertise, from the native probe. Every field
 * is optional: an unprobed or unpatched runtime resolves as "unknown", and
 * the policy below only withholds on facts it actually has (plus one
 * conservative rule for Dolby Vision profile 7).
 */
export interface DeviceDecodeCapabilities {
  /** Dolby Vision profile numbers the decoders advertise; null = unknown. */
  dolbyVisionProfiles?: number[] | null;
}

// ExoPlayer's MP4 extractor materializes the whole sample table on the Java
// heap: ~24 bytes per sample across its arrays. Against a 512 MB largeHeap
// with ~250 MB of app baseline, 10 M samples (~240 MB) is where a 3.5 h
// TrueHD remux (~16 M samples) already dies with OutOfMemoryError.
const MP4_SAMPLE_BUDGET = 10_000_000;
const MP4_FAMILY = new Set(["mp4", "m4v", "mov", "3gp"]);

/**
 * Why the raw-file tier must not be opened on this device even though the
 * server serves it — a device-side veto over `file.available`. Null when
 * nothing known forbids it. Android only: Apple never gets the tier
 * (AVFoundation cannot play the containers) and neither does web.
 */
export function fileTierWithholdReason(
  info: DirectPlayInfo | null | undefined,
  platformClass: PlatformClass,
  caps?: DeviceDecodeCapabilities | null,
): string | null {
  if (!isAndroid(platformClass)) return null;
  const file = info?.file;
  if (!file?.available) return null;

  const dvProfile = file.dvProfile;
  if (typeof dvProfile === "number") {
    const advertised = caps?.dolbyVisionProfiles;
    // Unprobed: no Android decoder in the field advertises profile 7 (the
    // enhancement layer is dropped by the extractor anyway), so withhold it
    // without waiting for a probe; other profiles need a real mismatch.
    const unsupported = advertised
      ? !advertised.includes(dvProfile)
      : dvProfile === 7;
    if (unsupported) {
      return `Dolby Vision profile ${dvProfile} can't be direct-played on this device.`;
    }
  }

  if (MP4_FAMILY.has((file.container ?? "").toLowerCase())) {
    if (typeof file.sampleCount === "number") {
      if (file.sampleCount > MP4_SAMPLE_BUDGET) {
        return "This file's index is too large for this device to direct-play.";
      }
    } else if (
      (file.audioCodecs ?? []).some((codec) => /truehd|mlp/i.test(codec))
    ) {
      // No sample count from the server: TrueHD (~1,200 access units per
      // second) is the one codec that reliably blows the budget on its own.
      return "TrueHD audio in an MP4 needs more memory than this device has for direct play.";
    }
  }

  return null;
}

/** Whether Android may open the raw file: served by the server AND not vetoed here. */
export function directPlayUsable(
  info: DirectPlayInfo | null | undefined,
  platformClass: PlatformClass,
  caps?: DeviceDecodeCapabilities | null,
): boolean {
  return (
    isAndroid(platformClass) &&
    !!info?.file?.available &&
    fileTierWithholdReason(info, platformClass, caps) === null
  );
}

/**
 * Whether the pinned-Original master can be requested: the verdict offers
 * the copy rung AND comes from a server that knows `?direct=only`. The
 * `original` block shipped in the same deploy as the mode, so its presence
 * is the marker; an older server handed `?direct=only` would serve some
 * other master while the app believed it was on Original.
 */
export function pinnedOriginalSupported(
  info: DirectPlayInfo | null | undefined,
): boolean {
  return !!info?.hls?.offered && info.original !== undefined;
}

export type QualityTierId = "auto" | "original" | "directplay" | "transcode";

export interface QualityTierOption {
  id: QualityTierId;
  label: string;
  /** One line under the label naming the mechanism, in plain words. */
  description?: string;
  /** Set when the tier is shown but not selectable — replaces the description. */
  unavailableReason?: string;
}

const TIER_LABEL: Record<QualityTierId, string> = {
  auto: "Auto",
  original: "Original",
  directplay: "Direct Play",
  transcode: "Transcoded only",
};

const TIER_DESCRIPTION: Record<QualityTierId, string> = {
  auto: "Adapts to your connection, up to the original video when it fits.",
  original: "The original video, pinned. Server-picked audio.",
  directplay: "The untouched file with every original audio track.",
  transcode:
    "The server's transcoded ladder only. Lowest bandwidth, most compatible.",
};

function row(id: QualityTierId, unavailableReason?: string): QualityTierOption {
  return unavailableReason
    ? { id, label: TIER_LABEL[id], unavailableReason }
    : { id, label: TIER_LABEL[id], description: TIER_DESCRIPTION[id] };
}

/**
 * §4's badge mapping over the raw verdict. Fallback for a missing enriched
 * `badgeLabel` — never call this to override a server-provided label.
 */
export function deriveOriginalLabel(info: DirectPlayInfo): string {
  if (info.hls?.supplementalCodecs) return "Original (Dolby Vision)";
  if (info.hls?.videoRange === "PQ") return "Original (HDR10)";
  return "Original";
}

/**
 * The "Original (…)" label for a title that offers Original, or null when it
 * has no Original to advertise.
 */
export function badgeLabel(
  info: DirectPlayInfo | null | undefined,
): string | null {
  // Optional-chain hls too: a misrouted proxy response (HTML error page
  // parsed as data) must render as "no badge", never throw mid-playback.
  if (!info?.hls?.offered) return null;
  return info.badgeLabel ?? deriveOriginalLabel(info);
}

/**
 * §3's reason table in native-app copy. Returns null for `disabled` (hide the
 * Original option entirely — server feature off) and for no reason at all.
 */
export function reasonToUserCopy(reason: string | undefined): string | null {
  switch (reason) {
    case undefined:
    case "disabled":
      return null;
    case "open-gop-avc":
      return "This file's format can't stream reliably without processing. Playing in high-quality transcode.";
    case "segment-floor":
    case "segment-budget":
      return "This file's structure exceeds streaming limits.";
    case "unscannable":
      return "The original stream couldn't be analyzed.";
    case "ineligible-source":
    case "unmappable-codec":
      return "This format can't be streamed unmodified.";
    case "poisoned":
      return "Original streaming was disabled for this title after a playback fault.";
    default:
      return "Original streaming isn't available for this title.";
  }
}

function resolveReasonCopy(info: DirectPlayInfo): string | null {
  return info.reasonCopy ?? reasonToUserCopy(info.hls?.reason);
}

/**
 * Whether a tier can actually be opened for this title on this device. Auto
 * and Transcoded only always can; the pinned tiers need the verdict.
 */
export function tierUsable(
  tier: QualityTierId,
  info: DirectPlayInfo | null | undefined,
  platformClass: PlatformClass,
  caps?: DeviceDecodeCapabilities | null,
): boolean {
  if (platformClass === "web") return tier === "auto";
  switch (tier) {
    case "original":
      return pinnedOriginalSupported(info);
    case "directplay":
      return directPlayUsable(info, platformClass, caps);
    default:
      return true;
  }
}

/**
 * The quality-menu rows for a platform given the current verdict (null while
 * the verdict is still loading). Auto and Transcoded only are always valid;
 * the pinned rows appear once the verdict is known — the menu grows when it
 * lands (the controls use sticky gating for exactly this) — and stay visible
 * with the reason when this title or this device rules them out.
 */
export function resolveAvailableTiers(
  info: DirectPlayInfo | null | undefined,
  platformClass: PlatformClass,
  caps?: DeviceDecodeCapabilities | null,
): QualityTierOption[] {
  // Web builds only ever get the ladder: raw /file in a browser <video> is
  // exactly what §6 forbids, and nothing pins a variant there.
  if (platformClass === "web") return [row("auto")];

  const tiers: QualityTierOption[] = [row("auto")];
  if (info) {
    if (pinnedOriginalSupported(info)) {
      tiers.push(row("original"));
    } else if (
      !info.hls?.offered &&
      info.hls?.reason !== undefined &&
      info.hls.reason !== "disabled"
    ) {
      // A concrete withhold reason means the feature exists and this title
      // is gated — show the row with the explanation. No reason at all (the
      // 404 sentinel from a pre-deploy server, or `disabled`) means §10's
      // "the menu simply lacks Original". Offered by a server without the
      // pinned mode is treated the same way.
      tiers.push(
        row(
          "original",
          resolveReasonCopy(info) ?? "Original isn't available for this title.",
        ),
      );
    }

    if (isAndroid(platformClass) && info.file?.available) {
      const withhold = fileTierWithholdReason(info, platformClass, caps);
      // Served but vetoed by this device: keep the row so the viewer learns
      // why instead of watching it fail into a lower tier.
      tiers.push(row("directplay", withhold ?? undefined));
    }
  }
  tiers.push(row("transcode"));
  return tiers;
}

/**
 * The player-source URL for a tier, given the canonical master URL the API
 * delivered. A pinned tier the title or device cannot take resolves to the
 * next tier that behaves closest to it, never to a URL that lies about what
 * it plays.
 */
export function resolveTierSourceURL(
  masterURL: string,
  tier: QualityTierId,
  info: DirectPlayInfo | null | undefined,
  platformClass: PlatformClass,
  caps?: DeviceDecodeCapabilities | null,
): string {
  // Defensive: the default master must never carry a stray `direct` param,
  // whatever the API delivered.
  if (platformClass === "web" || tier === "transcode") {
    return stripDirectParam(masterURL);
  }
  if (tier === "directplay" && directPlayUsable(info, platformClass, caps)) {
    return fileURL(masterURL) ?? masterURL;
  }
  if (tier === "original" && pinnedOriginalSupported(info)) {
    return withDirectOnlyParam(masterURL);
  }
  // Auto — and any pinned tier this title cannot take: the ?direct=1 master
  // is the ladder plus the Original rung when offered, identical to the
  // default master otherwise.
  return withDirectParam(masterURL);
}

/**
 * The tier a playback session should open with: the stored preference
 * (remembered-per-title, else global default), demoted to the nearest tier
 * that works when the preferred one is unavailable (verdict withholds it,
 * device vetoes it, or no verdict at all) or when the cellular data-saver is
 * active. The stored preference itself is never rewritten by demotion.
 */
export function resolveInitialTier(
  storedTier: QualityTierId,
  info: DirectPlayInfo | null | undefined,
  dataSaverActive: boolean,
  platformClass: PlatformClass,
  caps?: DeviceDecodeCapabilities | null,
): QualityTierId {
  if (platformClass === "web") return "auto";
  if (dataSaverActive) return "transcode";
  switch (storedTier) {
    case "transcode":
      return "transcode";
    case "directplay":
      if (directPlayUsable(info, platformClass, caps)) return "directplay";
      return pinnedOriginalSupported(info) ? "original" : "auto";
    case "original":
      return pinnedOriginalSupported(info) ? "original" : "auto";
    default:
      return "auto";
  }
}

/**
 * The next tier down when the current one fails to play — the §8 descent
 * target. The chain ends on the ladder: descending "to Auto" after the
 * Original rung failed would let ABR climb straight back into it.
 *   directplay → original (memory and audio failures are rescued there)
 *              → transcode when this title has no pinned Original
 *   original   → transcode
 *   auto       → transcode
 *   transcode  → nothing
 */
export function descentTierFor(
  tier: QualityTierId,
  platformClass: PlatformClass,
  info?: DirectPlayInfo | null,
): QualityTierId | null {
  if (platformClass === "web") return null;
  switch (tier) {
    case "directplay":
      return pinnedOriginalSupported(info) ? "original" : "transcode";
    case "original":
    case "auto":
      return "transcode";
    default:
      return null;
  }
}

export interface QualityPreferenceOption {
  id: QualityTierId;
  label: string;
  description: string;
}

/** The global-default choices a settings screen offers, per platform. */
export function globalDefaultOptions(
  platformClass: PlatformClass,
): QualityPreferenceOption[] {
  const option = (id: QualityTierId): QualityPreferenceOption => ({
    id,
    label: TIER_LABEL[id],
    description: TIER_DESCRIPTION[id],
  });
  if (platformClass === "web") return [option("auto")];
  if (isApple(platformClass)) {
    return [option("auto"), option("original"), option("transcode")];
  }
  return [
    option("auto"),
    option("original"),
    option("directplay"),
    option("transcode"),
  ];
}

/** The subset of expo-video's VideoTrack the badge needs. */
export interface ActiveVideoTrackFacts {
  size?: { width: number; height: number } | null;
  videoRange?: string | null;
  bitrate?: number | null;
  averageBitrate?: number | null;
}

export interface ActiveQualityInput {
  tier: QualityTierId;
  info: DirectPlayInfo | null | undefined;
  platformClass: PlatformClass;
  /** What the player is rendering now; null until it reports a track. */
  videoTrack: ActiveVideoTrackFacts | null | undefined;
  isSwitching?: boolean;
}

// Widths, not heights: a letterboxed 2.39:1 encode of a 4K source is
// 3840×1608 and still 4K.
function resolutionClass(size: ActiveVideoTrackFacts["size"]): string | null {
  const width = size?.width ?? 0;
  if (width >= 3200) return "4K";
  if (width >= 1800) return "1080p";
  if (width >= 1200) return "720p";
  if (width > 0) return `${size?.height ?? 0}p`;
  return null;
}

function rangeClass(range: string | null | undefined): string | null {
  const r = (range ?? "").toLowerCase();
  if (r === "pq" || r === "hlg") return "HDR";
  return null;
}

function within(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= b * tolerance;
}

/**
 * Whether the rendered track is the Original copy rung of a `?direct=1`
 * master, judged by matching the rung's declared bandwidth. ABR picks the
 * rung itself, so this is the only way to know.
 */
function isOriginalRung(
  info: DirectPlayInfo | null | undefined,
  track: ActiveVideoTrackFacts,
): boolean {
  if (!info?.hls?.offered) return false;
  const declared = info.hls.bandwidth;
  const declaredAverage = info.hls.averageBandwidth;
  if (declared && track.bitrate && within(track.bitrate, declared, 0.02)) {
    return true;
  }
  return !!(
    declaredAverage &&
    track.averageBitrate &&
    within(track.averageBitrate, declaredAverage, 0.02)
  );
}

/**
 * The badge in the player chrome: what is playing NOW, never what the title
 * merely offers. "Original (…)" / "Direct Play (…)" only when original bytes
 * are on screen — the pinned tiers, or Auto sitting on the copy rung
 * (recognised by bandwidth). Everything else names the tier and the
 * rendered resolution and range.
 */
export function describeActiveQuality(
  input: ActiveQualityInput,
): string | null {
  const { tier, info, platformClass, videoTrack, isSwitching } = input;
  if (isSwitching) return "Switching…";

  const detail = [
    resolutionClass(videoTrack?.size),
    rangeClass(videoTrack?.videoRange),
  ]
    .filter((part): part is string => !!part)
    .join(" · ");
  const withDetail = (label: string) =>
    detail ? `${label} · ${detail}` : label;
  const original = badgeLabel(info) ?? "Original";

  if (platformClass === "web") return withDetail("Auto");
  if (tier === "directplay")
    return original.replace(/^Original/, "Direct Play");
  if (tier === "original") return original;
  if (tier === "transcode") return withDetail("Transcode");
  if (videoTrack && isOriginalRung(info, videoTrack)) return original;
  return withDetail("Auto");
}
