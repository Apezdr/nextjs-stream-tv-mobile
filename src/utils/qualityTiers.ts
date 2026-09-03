// Display facts and per-platform tier options for the delivery-tiers contract
// (FRONTEND_PLAYBACK_REQUIREMENTS.md §3-§6). The server's enriched verdict
// fields (badgeLabel/reasonCopy) are the primary source; the pure functions
// here are the client-side fallback so a thin proxy still renders correctly.
// Source policy itself (which tier maps to which URL) is inherently app-local
// and lives in resolveAvailableTiers: Apple players cannot pin an HLS variant,
// so their tiers are master-level choices; Android "Original" is the raw file.
import { DirectPlayInfo } from "@/src/data/types/directPlay.types";
import { PlatformClass } from "@/src/utils/deviceInfo";
import {
  fileURL,
  stripDirectParam,
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
 * nothing known forbids it. Android only: Apple tiers are master-level and
 * AVFoundation parses natively; web never gets the tier.
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
      return `Dolby Vision profile ${dvProfile} can't be direct-played on this device. Playing the transcode.`;
    }
  }

  if (MP4_FAMILY.has((file.container ?? "").toLowerCase())) {
    if (typeof file.sampleCount === "number") {
      if (file.sampleCount > MP4_SAMPLE_BUDGET) {
        return "This file's index is too large for this device to direct-play. Playing the transcode.";
      }
    } else if (
      (file.audioCodecs ?? []).some((codec) => /truehd|mlp/i.test(codec))
    ) {
      // No sample count from the server: TrueHD (~1,200 access units per
      // second) is the one codec that reliably blows the budget on its own.
      return "TrueHD audio in an MP4 needs more memory than this device has for direct play. Playing the transcode.";
    }
  }

  return null;
}

/** Whether Android may open the raw file: served by the server AND not vetoed here. */
function fileTierUsable(
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

export type QualityTierId = "auto" | "original" | "transcode";

export interface QualityTierOption {
  id: QualityTierId;
  label: string;
  /** Set when the tier is shown but not selectable — rendered as subtext. */
  unavailableReason?: string;
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
 * The badge shown in the player chrome, or null when the title has no
 * Original tier to advertise.
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
 * The quality-menu rows for a platform given the current verdict (null while
 * the verdict is still loading). Apple rows are master-level and always valid;
 * the Android Original row appears only once the verdict is known — the menu
 * grows when it lands (the controls use sticky gating for exactly this).
 */
export function resolveAvailableTiers(
  info: DirectPlayInfo | null | undefined,
  platformClass: PlatformClass,
  caps?: DeviceDecodeCapabilities | null,
): QualityTierOption[] {
  if (isApple(platformClass)) {
    return [
      { id: "auto", label: "Auto (up to Original)" },
      { id: "transcode", label: "Transcoded only" },
    ];
  }

  const tiers: QualityTierOption[] = [{ id: "auto", label: "Auto" }];
  // Web builds get no Original tier: raw /file in a browser <video> is
  // exactly what §6 forbids (remux audio, open-GOP seeking).
  if (platformClass === "web" || !info) return tiers;

  const withhold = fileTierWithholdReason(info, platformClass, caps);
  if (info.file?.available && withhold === null) {
    tiers.push({ id: "original", label: "Original (Direct Play)" });
  } else if (withhold !== null) {
    // Served, but this device can't take it: keep the row so the viewer
    // learns why instead of watching it fail into Auto.
    tiers.push({
      id: "original",
      label: "Original",
      unavailableReason: withhold,
    });
  } else if (info.hls?.reason !== undefined && info.hls.reason !== "disabled") {
    // A concrete withhold reason means the feature exists and this title is
    // gated — show the row with the explanation. No reason at all (the 404
    // sentinel from a pre-deploy server, or `disabled`) means §10's "the
    // menu simply lacks Original": Auto-only.
    tiers.push({
      id: "original",
      label: "Original",
      unavailableReason:
        resolveReasonCopy(info) ?? "Original isn't available for this title.",
    });
  }
  return tiers;
}

/**
 * The player-source URL for a tier, given the canonical master URL the API
 * delivered. Apple tiers are master-level (no player can pin an HLS variant):
 * "auto"/"original" mean the `?direct=1` master, "transcode" the default
 * master. Android "original" means the raw file when it is actually served;
 * everything else stays on the transcode-only default master.
 */
export function resolveTierSourceURL(
  masterURL: string,
  tier: QualityTierId,
  info: DirectPlayInfo | null | undefined,
  platformClass: PlatformClass,
  caps?: DeviceDecodeCapabilities | null,
): string {
  if (isApple(platformClass)) {
    return tier === "transcode"
      ? stripDirectParam(masterURL)
      : withDirectParam(masterURL);
  }
  if (tier === "original" && fileTierUsable(info, platformClass, caps)) {
    return fileURL(masterURL) ?? masterURL;
  }
  // Defensive: the transcode-only default master must never carry a stray
  // `direct` param, whatever the API delivered.
  return stripDirectParam(masterURL);
}

/**
 * The tier a playback session should open with: the stored preference
 * (remembered-per-title, else global default), demoted to something safe when
 * the preferred tier is unavailable (verdict withholds it, or no verdict at
 * all) or when the cellular data-saver is active. The stored preference
 * itself is never rewritten by demotion.
 */
export function resolveInitialTier(
  storedTier: QualityTierId,
  info: DirectPlayInfo | null | undefined,
  dataSaverActive: boolean,
  platformClass: PlatformClass,
  caps?: DeviceDecodeCapabilities | null,
): QualityTierId {
  if (isApple(platformClass)) {
    if (dataSaverActive) return "transcode";
    return storedTier === "transcode" ? "transcode" : "auto";
  }
  if (platformClass === "web" || dataSaverActive) return "auto";
  return storedTier === "original" && fileTierUsable(info, platformClass, caps)
    ? "original"
    : "auto";
}

/**
 * The next tier down when the current one fails to play — the §8 descent
 * target. Null when there is nothing lower to fall back to.
 */
export function descentTierFor(
  tier: QualityTierId,
  platformClass: PlatformClass,
): QualityTierId | null {
  if (isApple(platformClass)) {
    return tier === "transcode" ? null : "transcode";
  }
  if (platformClass === "web") return null;
  return tier === "original" ? "auto" : null;
}

export interface QualityPreferenceOption {
  id: QualityTierId;
  label: string;
  description: string;
}

/**
 * The global-default choices a settings screen offers, phrased per platform:
 * Apple tiers are master-level ABR choices; Android's "original" preference
 * means direct-playing the raw file when the server offers it.
 */
export function globalDefaultOptions(
  platformClass: PlatformClass,
): QualityPreferenceOption[] {
  if (platformClass === "web") {
    return [
      {
        id: "auto",
        label: "Auto",
        description: "Adaptive quality from the server's transcoded ladder.",
      },
    ];
  }
  if (isApple(platformClass)) {
    return [
      {
        id: "auto",
        label: "Auto (up to Original)",
        description:
          "Adaptive quality across every tier, including the untouched original when available.",
      },
      {
        id: "transcode",
        label: "Transcoded only",
        description:
          "Always stream the server's transcoded ladder. Lower bandwidth.",
      },
    ];
  }
  return [
    {
      id: "auto",
      label: "Auto",
      description: "Adaptive quality from the server's transcoded ladder.",
    },
    {
      id: "original",
      label: "Prefer Original (Direct Play)",
      description:
        "Play the untouched original file when available. Highest quality and bandwidth.",
    },
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
 * master, judged by matching the rung's declared bandwidth. Apple players
 * pick the rung themselves, so this is the only way to know.
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
 * merely offers. "Original (…)" only when original bytes are on screen — the
 * raw file on Android, or the copy rung recognised by bandwidth on Apple.
 * Everything else names the tier and the rendered resolution and range.
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

  if (tier === "original" && isAndroid(platformClass)) {
    return badgeLabel(info) ?? "Original";
  }
  if (tier === "transcode") return withDetail("Transcode");

  // "auto": Android's default master never carries the Original rung; on
  // Apple the ?direct=1 master may, and ABR decides.
  if (
    isApple(platformClass) &&
    videoTrack &&
    isOriginalRung(info, videoTrack)
  ) {
    return badgeLabel(info) ?? "Original";
  }
  return withDetail("Auto");
}
