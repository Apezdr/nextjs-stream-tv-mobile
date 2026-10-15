/**
 * Client error reporting — sends structured error reports to the connected
 * media server per docs/client-error-reporting-contract.md.
 *
 * Fire-and-forget by design: never throws, never blocks callers, never
 * retries (the shared axios retry loop is opted out so a down server isn't
 * hammered from an error path), and sends each dedupeKey at most once per
 * app session. The server rate-limits at 30 reports/user/hour; a 429 puts
 * reporting into a temporary cooldown.
 */
import type { AxiosRequestConfig } from "axios";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Platform } from "react-native";

import { getAxiosInstance, ApiError } from "@/src/data/api/axiosClient";
import { API_ENDPOINTS } from "@/src/data/api/endpoints";
import type {
  ClientErrorReport,
  ClientErrorAppInfo,
  ClientErrorDeviceInfo,
  ClientErrorSeverity,
  PlaybackErrorDetails,
} from "@/src/data/types/clientError.types";
import type { Episode } from "@/src/stores/serverHealthStore";

// Server truncates message at 32k; trim client-side so a giant message can't
// push the payload past the 100 KB cap and get the whole report rejected.
const MAX_MESSAGE_LENGTH = 32_000;
const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;

const sentDedupeKeys = new Set<string>();
let cooldownUntil = 0;

/** FNV-1a 32-bit hash, hex-encoded — stable dedupe keys without a dep. */
function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getAppInfo(): ClientErrorAppInfo {
  let otaUpdateId: string | null = null;
  try {
    otaUpdateId = Updates.updateId ?? null;
  } catch {
    // expo-updates inactive (Expo Go / local dev)
  }
  return {
    version: Constants.expoConfig?.version ?? "unknown",
    otaUpdateId,
    platform: Platform.OS as ClientErrorAppInfo["platform"],
    isTV: Platform.isTV,
  };
}

function getDeviceInfo(): ClientErrorDeviceInfo {
  const constants = Platform.constants as Record<string, unknown>;
  if (Platform.OS === "android") {
    return {
      model: typeof constants.Model === "string" ? constants.Model : undefined,
      brand: typeof constants.Brand === "string" ? constants.Brand : undefined,
      manufacturer:
        typeof constants.Manufacturer === "string"
          ? constants.Manufacturer
          : undefined,
      osVersion:
        typeof constants.Release === "string" ? constants.Release : undefined,
      apiLevel:
        typeof constants.Version === "number" ? constants.Version : undefined,
    };
  }
  return {
    osVersion:
      typeof constants.osVersion === "string" ? constants.osVersion : undefined,
  };
}

export interface ReportClientErrorInput {
  category: ClientErrorReport["category"];
  severity: ClientErrorSeverity;
  /** Raw platform error text — pass through unmodified. */
  message: string;
  /**
   * Extra string mixed into the auto-computed dedupeKey (e.g. the stream
   * URL) so the same message on different content groups separately.
   * Ignored when `dedupeKey` is given explicitly.
   */
  dedupeContext?: string;
  dedupeKey?: string;
  /**
   * Send even if this dedupeKey already went out this session. For reports
   * that are events, not a recurring error: each one is wanted, and a shared
   * key is what groups them on the admin page.
   */
  allowRepeat?: boolean;
  details?: PlaybackErrorDetails | Record<string, unknown>;
}

/**
 * Send an error report to the connected server. Resolves true if the report
 * was accepted, false if it was skipped (dedupe/cooldown) or failed —
 * callers should not branch on this beyond logging.
 */
export async function reportClientError(
  input: ReportClientErrorInput,
): Promise<boolean> {
  try {
    const dedupeKey =
      input.dedupeKey ??
      `${input.category}:${hashString(input.message + (input.dedupeContext ?? ""))}`;

    if (!input.allowRepeat && sentDedupeKeys.has(dedupeKey)) return false;
    if (Date.now() < cooldownUntil) return false;

    const report: ClientErrorReport = {
      schemaVersion: 1,
      category: input.category,
      severity: input.severity,
      message: input.message.slice(0, MAX_MESSAGE_LENGTH),
      dedupeKey,
      occurredAt: new Date().toISOString(),
      app: getAppInfo(),
      device: getDeviceInfo(),
      ...(input.details ? { details: input.details } : {}),
    };

    // Mark as sent before the request — a failed send should not be
    // re-attempted from a later occurrence of the same error this session.
    sentDedupeKeys.add(dedupeKey);

    // No transport retries (the axios default); the 401 token-refresh path
    // still applies.
    await getAxiosInstance().request({
      url: API_ENDPOINTS.SYSTEM.CLIENT_ERROR,
      method: "POST",
      data: report,
    } as AxiosRequestConfig);

    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    }
    if (__DEV__) {
      console.warn("[ErrorReporting] Failed to send report:", error);
    }
    return false;
  }
}

// A flapping link could open an episode a minute; the server allows 30
// reports per user per hour across every category, so keep these well
// below that and leave room for playback errors.
const MAX_EPISODE_REPORTS_PER_SESSION = 10;
let episodeReportsSent = 0;

/**
 * One report per episode in which the server was unreachable from this
 * device, sent after recovery (nothing can be sent during it). `details`
 * carries what a reader needs to tell a dead link from a dead edge from a
 * dead origin: the request that opened the episode, every probe's outcome,
 * and whether Cloudflare answered.
 */
export function reportServerEpisode(episode: Episode): Promise<boolean> {
  if (episodeReportsSent >= MAX_EPISODE_REPORTS_PER_SESSION) {
    return Promise.resolve(false);
  }
  episodeReportsSent += 1;

  const endedAt = episode.endedAt ?? Date.now();
  const durationMs = endedAt - episode.startedAt;
  const failedProbes = episode.probes.filter((p) => p.outcome !== "ok").length;
  const { trigger } = episode;
  const triggerText =
    trigger.status !== undefined
      ? `HTTP ${trigger.status}`
      : (trigger.code ?? "no response");

  return reportClientError({
    category: "network",
    severity: episode.bannerShown ? "error" : "warning",
    message: `Server unreachable for ${Math.round(durationMs / 1000)}s: ${triggerText} on ${trigger.url}; ${failedProbes} of ${episode.probes.length} probes failed`,
    // One key per kind, not per episode, so the admin page shows "server
    // unreachable: N reports, M users" as one group instead of a new group
    // for every outage. allowRepeat is what lets a second episode in a
    // session through the per-session dedupe.
    dedupeKey: `network:server-unreachable:${episode.bannerShown ? "banner" : "brief"}`,
    allowRepeat: true,
    details: {
      startedAt: new Date(episode.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationMs,
      trigger,
      failedRequests: episode.failedRequests,
      probes: episode.probes.map((p) => ({
        ...p,
        at: new Date(p.at).toISOString(),
      })),
      bannerShown: episode.bannerShown,
      wentOffline: episode.wentOffline,
      recoveredBy: episode.recoveredBy ?? null,
    },
  });
}
