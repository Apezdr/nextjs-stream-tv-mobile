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
  if (info.hls.supplementalCodecs) return "Original (Dolby Vision)";
  if (info.hls.videoRange === "PQ") return "Original (HDR10)";
  return "Original";
}

/**
 * The badge shown in the player chrome, or null when the title has no
 * Original tier to advertise.
 */
export function badgeLabel(
  info: DirectPlayInfo | null | undefined,
): string | null {
  if (!info?.hls.offered) return null;
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
  return info.reasonCopy ?? reasonToUserCopy(info.hls.reason);
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

  if (info.file.available) {
    tiers.push({ id: "original", label: "Original (Direct Play)" });
  } else if (info.hls.reason !== undefined && info.hls.reason !== "disabled") {
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
): string {
  if (isApple(platformClass)) {
    return tier === "transcode"
      ? stripDirectParam(masterURL)
      : withDirectParam(masterURL);
  }
  if (platformClass !== "web" && tier === "original" && info?.file.available) {
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
): QualityTierId {
  if (isApple(platformClass)) {
    if (dataSaverActive) return "transcode";
    return storedTier === "transcode" ? "transcode" : "auto";
  }
  if (platformClass === "web" || dataSaverActive) return "auto";
  return storedTier === "original" && info?.file.available
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
