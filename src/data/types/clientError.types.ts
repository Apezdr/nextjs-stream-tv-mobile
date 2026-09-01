/**
 * Client error reporting types — must stay in sync with the server contract
 * in docs/client-error-reporting-contract.md
 * (POST /api/authenticated/client-error).
 */

export type ClientErrorCategory =
  "playback" | "network" | "auth" | "crash" | "other";

export type ClientErrorSeverity = "fatal" | "error" | "warning";

export interface ClientErrorAppInfo {
  /** Native app version (expo-constants). */
  version: string;
  /** EAS OTA update id, if running an OTA bundle. */
  otaUpdateId: string | null;
  platform: "android" | "ios" | "web";
  isTV: boolean;
}

export interface ClientErrorDeviceInfo {
  /** e.g. "BRAVIA 4K VH2", "SHIELD Android TV" */
  model?: string;
  brand?: string;
  manufacturer?: string;
  /** Android release ("10") or iOS version ("17.5"). */
  osVersion?: string;
  /** Android API level, when applicable. */
  apiLevel?: number;
}

export interface ClientErrorReport {
  schemaVersion: 1;
  /** Server accepts any non-empty string ≤ 50 chars — extensible. */
  category: ClientErrorCategory | string;
  severity: ClientErrorSeverity;
  /** Raw, unmodified platform error text. Server truncates at 32k chars. */
  message: string;
  /** Stable grouping key; sent at most once per app session. ≤ 256 chars. */
  dedupeKey: string;
  /** Client clock, ISO 8601. Server's receivedAt is authoritative. */
  occurredAt: string;
  app: ClientErrorAppInfo;
  device?: ClientErrorDeviceInfo;
  /** Category-specific detail, stored verbatim server-side. */
  details?: PlaybackErrorDetails | Record<string, unknown>;
}

export interface CodecSupportProbeEntry {
  mimeType: string;
  width: number;
  height: number;
  support: "hardware" | "software" | "unsupported" | "unknown";
}

/** `details` shape for category "playback". */
export interface PlaybackErrorDetails {
  /** The stream URL in use when the error fired (master.m3u8 URL). */
  videoURL: string | null;
  /** expo-video player status at error time. */
  playerStatus: string | null;
  /**
   * Playback session UUID — same id as sync/updatePlayback heartbeats;
   * the server's correlation key against presence + transcoder logs.
   */
  playbackSessionId: string | null;
  mediaId: string | null;
  mediaType: string | null;
  /** Decoder capability probe (Android only; empty elsewhere). */
  codecSupport: CodecSupportProbeEntry[];
  /**
   * Present when this report records an automatic delivery-tier descent
   * (FRONTEND_PLAYBACK_REQUIREMENTS.md §8): which tier failed, where playback
   * fell to, and at what position. Client-side counterpart of the server's
   * jit.direct.verdicts metric.
   */
  tierDescent?: {
    from: string;
    to: string;
    position: number;
  };
}
