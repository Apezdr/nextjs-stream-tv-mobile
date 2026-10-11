// src/stores/serverHealthStore.ts
//
// Whether the media server can be reached right now, and what to tell the
// user about it. One state machine fed from three places: every axios
// response (success or failure, see axiosClient), the session poll in
// AuthProvider (a plain fetch, so it reports here itself), and the device
// network state (useNetworkStatus).
//
// It replaced a check that retried /system-status at three layers, never
// cancelled anything, and could not tell a dead Wi-Fi link from a dead
// server. The rules now:
//
//   - A failed request only makes the server a SUSPECT. One cheap probe of
//     /api/status decides. Two failed probes in a row show the banner; the
//     first success of anything — probe, session poll, content request —
//     clears it.
//   - While the device is offline nothing is blamed on the server, and no
//     probe is sent.
//   - Every episode in which a probe actually failed is handed to the hook on
//     its way out, so React Query can refetch what broke and the episode can be
//     reported. An episode whose first probe passed is closed quietly: the
//     server was reachable the whole time, so the failing endpoint is its own
//     problem and refetching everything would only loop on it.
import { create } from "zustand";

import { API_ENDPOINTS } from "@/src/data/api/endpoints";

export type Reachability = "ok" | "suspect" | "unreachable" | "degraded";

export interface RequestFailure {
  /** Request path, host stripped. The query string stays: it carries no secrets. */
  url: string;
  status?: number;
  /** Transport error code when there was no response (ERR_NETWORK, ECONNABORTED, timeout…). */
  code?: string;
  /** A Cloudflare edge answered (cf-ray header present), so the origin may not have been reached. */
  viaCloudflare?: boolean;
}

export type ProbeOutcome =
  "ok" | "degraded" | "timeout" | "network" | `status:${number}`;

export interface ProbeResult {
  at: number;
  outcome: ProbeOutcome;
  elapsedMs: number;
  viaCloudflare?: boolean;
}

export interface Episode {
  startedAt: number;
  endedAt?: number;
  /** The request whose failure opened the episode. */
  trigger: RequestFailure;
  /** Failing requests noted while the episode was open, the trigger included. */
  failedRequests: number;
  probes: ProbeResult[];
  /** At least one probe failed: the server really was out of reach from here. */
  serverWasUnreachable: boolean;
  /** The red banner was shown at some point. */
  bannerShown: boolean;
  /** The device reported itself offline at some point during the episode. */
  wentOffline: boolean;
  recoveredBy?: "probe" | "request";
}

export interface HealthNotice {
  kind: "offline" | "unreachable" | "degraded";
  message: string;
}

interface ServerHealthState {
  reachability: Reachability;
  /** Device network, as reported by useNetworkStatus. Assumed online until told otherwise. */
  isOnline: boolean;
  episode: Episode | null;
}

export interface ServerHealthHooks {
  /**
   * Called once per episode in which the server was actually unreachable,
   * right after recovery. Episodes whose first probe passed are not reported.
   */
  onEpisodeEnded?: (episode: Episode) => void;
}

/** Delay between a failed request and the first probe, so a burst of failures sends one probe. */
export const PROBE_DEBOUNCE_MS = 1000;
/** Between the first failed probe and the confirming second one. */
export const CONFIRM_INTERVAL_MS = 3000;
/** While the banner is up. /api/status is a Mongo ping; this is cheap. */
export const RECOVERY_INTERVAL_MS = 10000;
/** Per probe. Longer than Mongo's own 2 s ping cap on the server, shorter than a user's patience. */
export const PROBE_TIMEOUT_MS = 8000;
/** The network just came back; give DHCP/DNS a moment before asking. */
export const ONLINE_RESUME_DELAY_MS = 1000;
export const FAILED_PROBES_BEFORE_BANNER = 2;
/** Probes kept per episode for the report. */
const MAX_PROBES_KEPT = 20;

export const useServerHealthStore = create<ServerHealthState>(() => ({
  reachability: "ok",
  isOnline: true,
  episode: null,
}));

// Module constants, not literals built per call: Zustand v5 hands the
// selector's result straight to useSyncExternalStore, which treats a fresh
// object on every call as a change and re-renders without end.
const NOTICES: Record<HealthNotice["kind"], HealthNotice> = {
  offline: { kind: "offline", message: "No network connection" },
  unreachable: {
    kind: "unreachable",
    message: "Can't reach the server. Retrying…",
  },
  degraded: {
    kind: "degraded",
    message: "The server is up, but its database isn't responding.",
  },
};

export function selectHealthNotice(
  state: ServerHealthState,
): HealthNotice | null {
  if (!state.isOnline) return NOTICES.offline;
  switch (state.reachability) {
    case "unreachable":
      return NOTICES.unreachable;
    case "degraded":
      return NOTICES.degraded;
    default:
      return null;
  }
}

// ── Module state the machine needs but nothing renders.
let server: string | null = null;
let hooks: ServerHealthHooks = {};
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let probeInFlight: Promise<void> | null = null;
let consecutiveProbeFailures = 0;

const { getState, setState } = useServerHealthStore;

function clearProbeTimer() {
  if (probeTimer) {
    clearTimeout(probeTimer);
    probeTimer = null;
  }
}

function scheduleProbe(delayMs: number) {
  clearProbeTimer();
  probeTimer = setTimeout(() => {
    probeTimer = null;
    void probe();
  }, delayMs);
}

function updateEpisode(patch: Partial<Episode>) {
  const { episode } = getState();
  if (episode) setState({ episode: { ...episode, ...patch } });
}

function recover(recoveredBy: Episode["recoveredBy"]) {
  const { episode } = getState();
  clearProbeTimer();
  consecutiveProbeFailures = 0;
  setState({ reachability: "ok", episode: null });
  if (episode?.serverWasUnreachable) {
    hooks.onEpisodeEnded?.({ ...episode, endedAt: Date.now(), recoveredBy });
  }
}

async function probe(): Promise<void> {
  if (probeInFlight) return probeInFlight;
  if (!server || !getState().isOnline || getState().reachability === "ok") {
    return;
  }

  const base = server;
  probeInFlight = (async () => {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    let outcome: ProbeOutcome;
    let viaCloudflare: boolean | undefined;
    try {
      // A unique query string on top of `cache: "no-store"`: the route sends no
      // Cache-Control, and NSURLCache on tvOS will otherwise keep answering an
      // old 200 for as long as the outage lasts.
      const response = await fetch(
        `${base}${API_ENDPOINTS.SYSTEM.HEALTH}?_=${startedAt}`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "omit",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        },
      );
      viaCloudflare = !!response.headers?.get?.("cf-ray");
      if (response.ok) outcome = "ok";
      else if (response.status === 503) outcome = "degraded";
      else outcome = `status:${response.status}`;
    } catch (error: unknown) {
      outcome =
        error instanceof Error && error.name === "AbortError"
          ? "timeout"
          : "network";
    } finally {
      clearTimeout(timeout);
    }

    // The world may have moved on while the request was out: a reset or a
    // server change, or a recovery through some other request.
    if (server !== base || getState().reachability === "ok") return;
    // A failure that lands after the device went offline says nothing about
    // the server and would only flash the red banner for a second on
    // reconnect. A success still counts: a 200 proves the server reachable
    // even when expo-network is lagging behind the link.
    if (!getState().isOnline && outcome !== "ok") return;

    const result: ProbeResult = {
      at: startedAt,
      outcome,
      elapsedMs: Date.now() - startedAt,
      ...(viaCloudflare !== undefined && { viaCloudflare }),
    };
    const { episode } = getState();
    if (episode) {
      updateEpisode({
        probes: [...episode.probes, result].slice(-MAX_PROBES_KEPT),
        serverWasUnreachable: episode.serverWasUnreachable || outcome !== "ok",
      });
    }

    if (outcome === "ok") {
      recover("probe");
      return;
    }

    if (outcome === "degraded") {
      // Reachable, honest, and unable to serve: show it, and keep asking.
      consecutiveProbeFailures = 0;
      setState({ reachability: "degraded" });
      updateEpisode({ bannerShown: true });
      scheduleProbe(RECOVERY_INTERVAL_MS);
      return;
    }

    consecutiveProbeFailures += 1;
    if (consecutiveProbeFailures >= FAILED_PROBES_BEFORE_BANNER) {
      setState({ reachability: "unreachable" });
      updateEpisode({ bannerShown: true });
      scheduleProbe(RECOVERY_INTERVAL_MS);
    } else {
      setState({ reachability: "suspect" });
      scheduleProbe(CONFIRM_INTERVAL_MS);
    }
  })().finally(() => {
    probeInFlight = null;
  });

  return probeInFlight;
}

export const serverHealth = {
  /** The server to probe. null (signed out) disables probing and drops any open episode unreported. */
  configure(options: { server: string | null }): void {
    const next = options.server ? options.server.replace(/\/+$/, "") : null;
    if (next === server) return;
    server = next;
    serverHealth.reset();
  },

  setHooks(next: ServerHealthHooks): void {
    hooks = next;
  },

  /**
   * A request that got no response, or a 5xx. Opens an episode and schedules
   * the probe; while an episode is open the probe loop owns the verdict.
   */
  noteFailure(failure: RequestFailure): void {
    if (!server) return;
    const state = getState();
    // Nothing reaches anything while the device is offline. Not the server's fault.
    if (!state.isOnline) return;

    if (state.reachability === "ok") {
      setState({
        reachability: "suspect",
        episode: {
          startedAt: Date.now(),
          trigger: failure,
          failedRequests: 1,
          probes: [],
          serverWasUnreachable: false,
          bannerShown: false,
          wentOffline: false,
        },
      });
      consecutiveProbeFailures = 0;
      scheduleProbe(PROBE_DEBOUNCE_MS);
      return;
    }

    if (state.episode) {
      updateEpisode({ failedRequests: state.episode.failedRequests + 1 });
    }
  },

  /** Any successful response from the server. Clears everything. */
  noteSuccess(): void {
    if (getState().reachability === "ok") return;
    recover("request");
  },

  /** Device network state. Offline pauses probing; coming back online probes at once if anything was wrong. */
  setOnline(isOnline: boolean): void {
    const state = getState();
    if (state.isOnline === isOnline) return;
    setState({ isOnline });
    if (!isOnline) {
      clearProbeTimer();
      updateEpisode({ wentOffline: true });
      return;
    }
    if (state.reachability !== "ok") scheduleProbe(ONLINE_RESUME_DELAY_MS);
  },

  /** The app came to the foreground; timers may have slept through the outage. */
  probeIfUnhealthy(): void {
    if (getState().reachability !== "ok") scheduleProbe(0);
  },

  /** Sign-out, or a server change. Nothing in flight may touch the next session's state. */
  reset(): void {
    clearProbeTimer();
    consecutiveProbeFailures = 0;
    setState({ reachability: "ok", episode: null });
  },
};
