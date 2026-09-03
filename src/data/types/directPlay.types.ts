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

/** One container audio track, as the server probed it (`file.audioTracks`). */
export interface DirectPlayAudioTrack {
  /** Position among audio streams only (ffmpeg's `0:a:{n}` index). */
  index: number;
  codec?: string;
  channels?: number;
  /** BCP-47, null when the track is untagged. */
  language?: string | null;
  /** The container's own track title (Matroska Name, MP4 udta name). */
  title?: string | null;
  /** The container's default-track flag. */
  default?: boolean;
  /**
   * The server's verdict that this is commentary or audio description, from
   * dispositions or the same four title keywords the app matches.
   */
  descriptive?: boolean;
}

/** One rendition an Original master carries (`original.audio`). */
export interface DirectPlayOriginalAudio {
  /** HLS GROUP-ID (`aud-aac`, `aud-ec3`, `aud-ac3`). */
  groupId: string;
  language?: string;
  channels?: number;
  /** RFC 6381 codecs string. */
  codecs?: string;
  bitrate?: string;
  /** Carries DEFAULT=YES in the manifest. */
  default?: boolean;
  /** Which `file.audioTracks[].index` this rendition re-encodes from. */
  sourceTrack?: number;
  name?: string;
  displayName?: string;
}

export interface DirectPlayFileInfo {
  /** Whether `GET /stream/{key}/file` serves the original bytes. */
  available: boolean;
  sizeBytes?: number;
  container?: string;
  videoCodec?: string;
  /** Codec names of every audio stream in the container. */
  audioCodecs?: string[];
  audioTracks?: DirectPlayAudioTrack[];
  /**
   * The SOURCE file's Dolby Vision profile (5, 7, 8), null without a DOVI
   * configuration record. Not `hls.supplementalCodecs`, which is what the
   * server would signal and reads null for a profile-7 source.
   */
  dvProfile?: number | null;
  /**
   * Raw-file index facts for MP4-family containers: the size of the moov
   * atom, the whole-file sample count, and the server's classification of
   * the index. Matroska reports null / "not-applicable" (no whole-file
   * sample table, so the native-player heap budget does not apply).
   */
  moovBytes?: number | null;
  sampleCount?: number | null;
  indexClass?: string;
}

export interface DirectPlayInfo {
  hls: DirectPlayHlsInfo;
  file: DirectPlayFileInfo;
  /** What an Original master carries (renditions the server picked). */
  original?: {
    audio?: DirectPlayOriginalAudio[];
  };
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
