/**
 * Delivery-tier verdict for one playable item — the authenticated proxy of
 * jit-transcoder's `GET /stream/{key}/direct.json` (epoch 16), enriched by the
 * server with display fields. See FRONTEND_PLAYBACK_REQUIREMENTS.md §3.
 */

export type DirectPlayWithholdReason =
  | "open-gop-avc"
  | "segment-floor"
  | "segment-budget"
  | "unscannable"
  | "ineligible-source"
  | "poisoned"
  | "disabled";

export interface DirectPlayHlsInfo {
  /** Whether the `?direct=1` master carries the Original copy rung. */
  offered: boolean;
  /** Why the rung is withheld; present when `offered` is false. */
  reason?: DirectPlayWithholdReason | string;
  variantIndex?: number;
  codecs?: string;
  bandwidth?: number;
  averageBandwidth?: number;
  /** "PQ" on HDR10 / Dolby Vision base layers. */
  videoRange?: string;
  /** e.g. "dvh1.08.06/db1p" — presence means Dolby Vision. */
  supplementalCodecs?: string;
}

export interface DirectPlayFileInfo {
  /** Whether `GET /stream/{key}/file` serves the original bytes. */
  available: boolean;
  sizeBytes?: number;
  container?: string;
  videoCodec?: string;
}

export interface DirectPlayInfo {
  hls: DirectPlayHlsInfo;
  file: DirectPlayFileInfo;
  /**
   * Server-computed badge ("Original (Dolby Vision)" | "Original (HDR10)" |
   * "Original"). Clients fall back to deriveOriginalLabel() when absent.
   */
  badgeLabel?: string;
  /**
   * Server-computed user copy for `reason`. Clients fall back to
   * reasonToUserCopy() when absent.
   */
  reasonCopy?: string;
}

/**
 * Identity of the playable item. Episode-level for shows — the verdict is a
 * property of the underlying file, not the title.
 */
export interface DirectPlayInfoParams {
  mediaType: string;
  mediaId: string;
  season?: number;
  episode?: number;
}

/**
 * The verdict used until a real one arrives (endpoint missing on a pre-deploy
 * server, or the upstream keyframe derivation still running): nothing offered,
 * menu shows Auto only, playback unaffected.
 */
export const NO_DIRECT_PLAY_INFO: DirectPlayInfo = {
  hls: { offered: false },
  file: { available: false },
};
