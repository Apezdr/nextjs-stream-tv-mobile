// app/providers/AuthProvider.tsx
import { SplashScreen } from "expo-router";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  PropsWithChildren,
} from "react";
import { Alert, AppState, AppStateStatus } from "react-native";

import {
  createBetterAuthClient,
  serverOrigin,
  type BetterAuthClient,
} from "@/src/data/api/authClient";
import { API_ENDPOINTS } from "@/src/data/api/endpoints";
import { enhancedApiClient } from "@/src/data/api/enhancedClient";
import { cacheStore } from "@/src/data/cache/cacheStore";
import { clearAllCaches } from "@/src/data/query/queryClient";
import type {
  DeviceCodeResponse,
  GetSessionResponse,
} from "@/src/data/types/auth.types";
import { classifySessionBody } from "@/src/providers/authSessionPolicy";
import { useBackdropStore } from "@/src/stores/backdropStore";

type User = {
  id: string;
  name: string;
  email: string;
  approved: boolean;
  limitedAccess?: boolean;
  role?: "user" | "admin";
  admin?: boolean;
};

type PersistedAuthInfo = {
  server: string | null;
  user: User | null;
  accessToken: string | null;
};

interface AuthContextType {
  /** true once we've rehydrated from storage */
  ready: boolean;
  /** true once API client is fully configured with baseUrl and credentials */
  apiReady: boolean;
  /** the API host you entered, e.g. "https://cinema.test.com" */
  server: string | null;
  /** call this first (with your validated host) */
  setServer: (url: string) => Promise<void>;
  /** opens browser to verification_uri_complete and polls for token */
  signInWithProvider: (providerId: string) => Promise<void>;
  /** starts device authorization flow — returns device code response for QR display */
  signInWithQRCode: () => Promise<DeviceCodeResponse>;
  /** poll for QR/device authentication completion */
  pollQRAuthentication: (
    deviceCode: string,
    onTerminalError?: (
      code: "expired" | "access_denied" | "server_down",
    ) => void,
  ) => Promise<void>;
  /** cancel QR authentication and stop polling */
  cancelQRAuthentication: () => void;
  /** full user profile, or null if logged out */
  user: User | null;
  /** logs you out and invalidates the session on the server */
  signOut: () => Promise<void>;
  /** manually refresh user status */
  refreshUserStatus: () => Promise<void>;
  /** indicates if currently checking user status */
  isRefreshing: boolean;
  /** indicates if currently authenticating */
  isAuthenticating: boolean;
  /** refresh the authentication token if needed */
  refreshToken: () => Promise<boolean>;
  /** indicates if server is currently down/unreachable */
  isServerDown: boolean;
  /** last known server status message */
  serverStatusMessage: string | null;
  /**
   * true when the last sign-out was forced by the server invalidating the
   * session, rather than requested by the user. Login screens use it to
   * explain why re-authentication is being asked for.
   */
  sessionExpired: boolean;
  /** dismiss the "your session ended" notice */
  clearSessionExpiredNotice: () => void;
}

const STORAGE_KEY = "auth-info";
const STATUS_CHECK_INTERVAL = 30000; // 30 seconds
/** Server requires minimum 5s polling interval per deviceAuthorization config */
const AUTH_POLL_INTERVAL = 5000;
const AUTH_TIMEOUT = 5 * 60 * 1000; // 5 minutes
/**
 * RN's fetch can hang indefinitely on flaky mobile networks (backgrounding,
 * network handoff) with no built-in timeout. Session checks and sign-out
 * both depend on this call actually settling, so it's bounded explicitly.
 */
const SESSION_FETCH_TIMEOUT_MS = 10000;

// Enable for detailed auth flow logging
const DEBUG_AUTH = __DEV__;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/** fetch() with a hard timeout — see SESSION_FETCH_TIMEOUT_MS. */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = SESSION_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const normalizeStoredAuth = (raw: string): PersistedAuthInfo | null => {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const server = isNonEmptyString(parsed.server) ? parsed.server : null;

    const candidateToken =
      parsed.accessToken ??
      parsed.token ??
      (parsed.session as Record<string, unknown> | undefined)?.token ??
      null;
    const accessToken = isNonEmptyString(candidateToken)
      ? candidateToken
      : null;

    const parsedUser = parsed.user;
    const user =
      parsedUser && typeof parsedUser === "object"
        ? (parsedUser as User)
        : null;

    // Guard against partial / legacy persisted state. A user without token
    // causes login flow loops after app updates.
    if (!accessToken || !user || !server) {
      return {
        server,
        user: null,
        accessToken: null,
      };
    }

    return {
      server,
      user,
      accessToken,
    };
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [server, setServerRaw] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isServerDown, setIsServerDown] = useState(false);
  const [serverStatusMessage, setServerStatusMessage] = useState<string | null>(
    null,
  );
  /**
   * Set when the session was ended by the server rather than by the user, so
   * the login screens can explain why they're being asked to sign in again.
   * Cleared once a new sign-in completes or the notice is dismissed.
   */
  const [sessionExpired, setSessionExpired] = useState(false);

  const statusCheckInterval = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const serverRecoveryInterval = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const authPollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const authTimeoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const betterAuthClient = useRef<BetterAuthClient | null>(null);

  // ── Mirrors of the auth state, for the code that runs outside a render:
  // the status-check interval, the AppState listener, and the axios 401
  // callback are each registered once and would otherwise be frozen against
  // whichever render installed them. Reading through refs keeps them correct
  // without having to tear down and re-register on every state change.
  const serverRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const userRef = useRef<User | null>(null);
  serverRef.current = server;
  accessTokenRef.current = accessToken;
  userRef.current = user;

  /**
   * Re-entrancy guards. Refs, not state, on purpose: a state flag read inside
   * a long-lived closure is a snapshot of the render that installed that
   * closure, so it can be permanently wrong. That is exactly how the 30s
   * session poll used to wedge — see startStatusChecking(). `isRefreshing`
   * state still exists, but only to drive UI.
   */
  const isRefreshingRef = useRef(false);
  const signingOutRef = useRef(false);
  /**
   * Shared in-flight probe. A dead session makes every visible query 401 at
   * once, and without this each one would fire its own get-session and its
   * own sign-out.
   */
  const sessionProbeRef = useRef<Promise<boolean> | null>(null);

  // 1️⃣ Keep splash up until we rehydrate
  useEffect(() => {
    SplashScreen.preventAutoHideAsync();
  }, []);

  // 2️⃣ On mount: restore auth data from SecureStore
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw) {
          const normalized = normalizeStoredAuth(raw);
          if (normalized) {
            const { server: s, user: u, accessToken: t } = normalized;
            setServerRaw(s);
            setUser(u);
            setAccessToken(t);
            // Initialise the auth client so the QR/device flow works even when
            // the user has a stored server URL but no valid token (e.g. after
            // token expiry or sign-out).
            if (s) {
              betterAuthClient.current = createBetterAuthClient(s);
            }

            // Rewrite storage in normalized format to complete one-time migration.
            await SecureStore.setItemAsync(
              STORAGE_KEY,
              JSON.stringify(normalized),
            );
          } else {
            await SecureStore.deleteItemAsync(STORAGE_KEY);
            setServerRaw(null);
            setUser(null);
            setAccessToken(null);
          }
        }
      } catch (e) {
        console.warn("Auth rehydrate failed", e);
      } finally {
        setReady(true);
        SplashScreen.hideAsync();
      }
    })();
  }, []);

  // 3️⃣ Start/stop status checking based on auth state.
  //
  // Keyed on whether a session EXISTS, not on the identity of the values.
  // With `user` in the deps this tore down and rebuilt the interval every time
  // a status check refreshed the user object — and since startStatusChecking()
  // also fires an immediate check, a user record that differs on each response
  // would drive a probe/re-render/probe loop.
  const hasSession = !!(server && user && accessToken);
  useEffect(() => {
    if (hasSession) {
      startStatusChecking();
    } else {
      stopStatusChecking();
    }

    return () => stopStatusChecking();
    // startStatusChecking/stopStatusChecking are intentionally omitted: they
    // are re-created every render but only ever touch refs, so re-subscribing
    // on their identity would reintroduce the churn described above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession]);

  // 4️⃣ Handle app state changes (check status when app becomes active)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active" &&
        userRef.current &&
        accessTokenRef.current
      ) {
        refreshUserStatus();
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription?.remove();
    // Subscribe once. The handler reads current auth state through refs, so
    // it never needs re-registering — and re-registering on every `user`
    // change is what let this listener go stale in the first place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 5️⃣ Ensure polling stops when user becomes authenticated
  useEffect(() => {
    if (user && accessToken && !isAuthenticating) {
      if (DEBUG_AUTH) {
        console.log(
          "[Auth] User authenticated and not currently authenticating, stopping any active polling",
        );
      }
      stopAuthPolling();
    }
  }, [user, accessToken, isAuthenticating]);

  // 6️⃣ Configure API client based on authentication state
  useEffect(() => {
    if (server && accessToken) {
      if (DEBUG_AUTH) {
        console.log("[Auth] Configuring API client with server and token");
      }

      enhancedApiClient.setBaseUrl(server);
      enhancedApiClient.setAuthToken(accessToken);
      enhancedApiClient.setTokenRefreshCallback(refreshToken);
      enhancedApiClient.setServerStatusCheckCallback(checkServerStatus);
      cacheStore.invalidateUserSpecificCache();
      setApiReady(true);

      if (DEBUG_AUTH) {
        console.log("[Auth] API client is now ready for requests");
      }
    } else {
      if (DEBUG_AUTH) {
        console.log("[Auth] Clearing API client configuration");
      }

      enhancedApiClient.setBaseUrl(null);
      enhancedApiClient.setAuthToken(null);
      enhancedApiClient.setTokenRefreshCallback(null);
      // Also drop the status-check callback. Leaving it registered meant a
      // late axios error after sign-out could still invoke a checkServerStatus
      // closure holding the old server, restarting the recovery interval
      // against a host we're no longer signed in to.
      enhancedApiClient.setServerStatusCheckCallback(null);
      setApiReady(false);
    }
  }, [server, accessToken]);

  // 7️⃣ Cleanup on component unmount
  useEffect(() => {
    return () => {
      stopStatusChecking();
      stopAuthPolling();
    };
  }, []);

  // Helper to persist auth data
  const persist = async (
    s: string | null,
    u: User | null,
    t: string | null,
  ) => {
    await SecureStore.setItemAsync(
      STORAGE_KEY,
      JSON.stringify({ server: s, user: u, accessToken: t }),
    );
  };

  const startStatusChecking = () => {
    stopStatusChecking();
    statusCheckInterval.current = setInterval(() => {
      refreshUserStatus();
    }, STATUS_CHECK_INTERVAL);
    refreshUserStatus();
  };

  const stopStatusChecking = () => {
    if (statusCheckInterval.current) {
      clearInterval(statusCheckInterval.current);
      statusCheckInterval.current = null;
    }
    stopServerRecoveryChecking();
  };

  const startServerRecoveryChecking = () => {
    stopServerRecoveryChecking();
    if (DEBUG_AUTH) console.log("[Auth] Starting server recovery checking");
    serverRecoveryInterval.current = setInterval(() => {
      if (DEBUG_AUTH) console.log("[Auth] Checking if server has recovered");
      checkServerStatus();
    }, 10000);
  };

  const stopServerRecoveryChecking = () => {
    if (serverRecoveryInterval.current) {
      if (DEBUG_AUTH) console.log("[Auth] Stopping server recovery checking");
      clearInterval(serverRecoveryInterval.current);
      serverRecoveryInterval.current = null;
    }
  };

  const stopAuthPolling = () => {
    if (DEBUG_AUTH) console.log("[Auth] Stopping all auth polling");
    if (authPollInterval.current) {
      clearInterval(authPollInterval.current);
      authPollInterval.current = null;
    }
    if (authTimeoutTimer.current) {
      clearTimeout(authTimeoutTimer.current);
      authTimeoutTimer.current = null;
    }
  };

  const checkServerStatus = async (): Promise<void> => {
    // Via the ref, not `server`: this runs from the probe's error paths and
    // from the axios status-check callback, both of which can be holding an
    // older render's closure. Reading state directly there would see null and
    // silently skip every check.
    if (!serverRef.current) return;
    try {
      if (DEBUG_AUTH)
        console.log("[Auth] Checking server status via enhanced client");
      const statusSummary = await enhancedApiClient.checkServerStatus();
      if (!statusSummary) {
        setIsServerDown(true);
        setServerStatusMessage("Unable to determine server status");
        return;
      }
      if (statusSummary.isNextJSAppDown) {
        setIsServerDown(true);
        setServerStatusMessage(statusSummary.message);
        startServerRecoveryChecking();
        if (DEBUG_AUTH)
          console.log("[Auth] NextJS app is down:", statusSummary.message);
      } else {
        setIsServerDown(false);
        stopServerRecoveryChecking();
        if (statusSummary.hasServerIssues) {
          setServerStatusMessage(statusSummary.message);
          if (DEBUG_AUTH)
            console.log(
              "[Auth] Server issues detected:",
              statusSummary.message,
            );
        } else {
          setServerStatusMessage(null);
          if (DEBUG_AUTH) console.log("[Auth] All systems operational");
        }
      }
    } catch (error) {
      console.error("[Auth] Server status check failed:", error);
      setIsServerDown(true);
      setServerStatusMessage(
        "Server status check failed. Attempting to reconnect.",
      );
      startServerRecoveryChecking();
    }
  };

  /**
   * The single authoritative "is this session still alive?" probe. Resolves
   * true while the session is live, false otherwise — and when the server
   * says the session is gone, it performs the sign-out itself.
   *
   * This deliberately owns the sign-out decision outright. It used to be
   * split: refreshUserStatus() would detect a dead session and then delegate
   * to refreshToken(), which repeated the identical request and only signed
   * out if that SECOND call also said dead. Any 5xx or timeout on the second
   * call left the user signed in holding a dead token. One authoritative
   * answer is enough — classifySessionBody() only reports "sign-out" for
   * responses that are conclusive on their own.
   *
   * Concurrent callers share one request: a revoked session makes every
   * visible query 401 at once, and N unshared probes would mean N sign-outs.
   */
  const probeSession = async (): Promise<boolean> => {
    if (sessionProbeRef.current) return sessionProbeRef.current;

    const currentServer = serverRef.current;
    const currentToken = accessTokenRef.current;
    if (!currentServer || !currentToken) return false;
    // A sign-out already in progress is itself the answer.
    if (signingOutRef.current) return false;

    const run = (async (): Promise<boolean> => {
      try {
        // disableCookieCache defeats better-auth's cookie-cache read path, so
        // a revoked session can't answer "valid" from a cached copy. Bearer
        // requests don't normally carry the session_data cookie that feeds
        // that cache, but Android's OS cookie jar can attach one uninvited.
        // NB: the server coerces this with z.coerce.boolean(), where the
        // string "false" is truthy — the param must be omitted to mean false,
        // never sent as false.
        const response = await fetchWithTimeout(
          `${currentServer}${API_ENDPOINTS.AUTH.GET_SESSION}?disableCookieCache=true`,
          { headers: { Authorization: `Bearer ${currentToken}` } },
        );

        // Read as text, not .json(). classifySessionBody() has to tell an
        // authoritative `null` body apart from a body that simply didn't
        // parse — the first means the session is gone, the second means a
        // proxy answered instead of the server and proves nothing.
        const rawBody = await response.text();
        const outcome = classifySessionBody(response.status, rawBody);

        let data: GetSessionResponse | null = null;
        if (outcome === "valid") {
          data = JSON.parse(rawBody) as GetSessionResponse | null;
        }

        switch (outcome) {
          case "sign-out":
            if (DEBUG_AUTH)
              console.log(
                "[Auth] Server reports no live session (status:",
                response.status,
                ") — signing out",
              );
            await signOut({ reason: "session-invalidated" });
            return false;

          case "server-issue":
            // The server is unwell, which says nothing about this session.
            // Signing out here would evict users over a transient 5xx.
            console.warn("[Auth] Server error during session check");
            await checkServerStatus();
            return false;

          case "unknown-error":
            if (DEBUG_AUTH)
              console.log(
                `[Auth] Unexpected session check status: ${response.status}`,
              );
            return false;

          case "valid":
            break;
        }

        // classifySessionBody() only returns "valid" when the body carries a
        // user, but that isn't visible to TS as a type guard on `data`.
        if (!data?.user) return false;

        const updatedUser: User = {
          ...data.user,
          admin: data.user.role === "admin",
        };

        if (JSON.stringify(updatedUser) !== JSON.stringify(userRef.current)) {
          if (DEBUG_AUTH)
            console.log("[Auth] User data changed, updating state");
          setUser(updatedUser);
          await persist(currentServer, updatedUser, currentToken);
        }
        return true;
      } catch (error: unknown) {
        // A genuine network failure (TypeError) or this fetch's own timeout
        // abort. We couldn't complete the check, so treat it as a
        // connectivity/server problem — never as grounds for a sign-out.
        console.warn("[Auth] Session check failed:", error);
        await checkServerStatus();
        return false;
      }
    })();

    sessionProbeRef.current = run;
    try {
      return await run;
    } finally {
      sessionProbeRef.current = null;
    }
  };

  /** Fetch current session from server, update user state */
  const refreshUserStatus = async () => {
    if (!serverRef.current || !accessTokenRef.current) return;
    if (isRefreshingRef.current) return;

    isRefreshingRef.current = true;
    setIsRefreshing(true);
    try {
      await probeSession();
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  };

  /** Call this with your validated host */
  const setServer = async (url: string) => {
    betterAuthClient.current = createBetterAuthClient(url);

    // If user switches server, drop existing credentials to avoid carrying
    // stale sessions across hosts or auth schema changes.
    if (server && server !== url) {
      setUser(null);
      setAccessToken(null);
      await persist(url, null, null);
      setServerRaw(url);
      return;
    }

    setServerRaw(url);
    await persist(url, user, accessToken);
  };

  /**
   * Request a device code and open browser to verification_uri_complete.
   * Both mobile and TV use this flow; TV calls signInWithQRCode instead
   * to get the response for QR rendering.
   */
  async function signInWithProvider(_providerId: string) {
    if (!server) throw new Error("Must call setServer first");

    try {
      setIsAuthenticating(true);

      if (DEBUG_AUTH)
        console.log("[Auth] Starting device authorization flow (mobile)");

      const deviceData = await requestDeviceCode();
      const { device_code, verification_uri_complete } = deviceData;

      if (DEBUG_AUTH)
        console.log("[Auth] Opening browser to:", verification_uri_complete);

      const { openAuthSessionAsync } = await import("expo-web-browser");
      await openAuthSessionAsync(verification_uri_complete, null, {
        showInRecents: true,
      });

      if (DEBUG_AUTH)
        console.log("[Auth] Browser opened, beginning polling for token");

      // Mobile has no persistent error card, so surface terminal poll failures
      // (server unreachable / denied / expired) via an Alert rather than
      // leaving the user staring at a stuck button.
      await startDeviceTokenPolling(device_code, (code) => {
        const message =
          code === "access_denied"
            ? "The sign-in request was denied."
            : code === "expired"
              ? "The sign-in request timed out. Please try again."
              : "Couldn't reach the server to finish signing in. Please try again.";
        Alert.alert("Sign-in failed", message);
      });
    } catch (error: unknown) {
      console.error("[Auth] Authentication error:", error);
      stopAuthPolling();
      setIsAuthenticating(false);
      throw error;
    }
  }

  /** Request a device code from the server */
  async function requestDeviceCode(): Promise<DeviceCodeResponse> {
    // Self-heal rather than dead-ending. The client is a per-server object we
    // can rebuild from `server` at any time, so there is no reason to make the
    // user re-enter a host they already gave us just because the instance went
    // missing (sign-out used to null it, and rehydrate skips it when no server
    // was stored).
    if (!betterAuthClient.current && serverRef.current) {
      betterAuthClient.current = createBetterAuthClient(serverRef.current);
    }
    const client = betterAuthClient.current;
    if (!client)
      throw new Error(
        "Sign-in isn't ready — go back and reconnect to the server.",
      );

    // better-auth's client returns { data, error } and normally does NOT throw,
    // but guard against network-level throws (DNS/TLS/offline/CORS) too.
    let result: Awaited<ReturnType<typeof client.device.code>>;
    try {
      result = await client.device.code({ client_id: "mobile-app" });
    } catch (networkError: unknown) {
      if (DEBUG_AUTH)
        console.error("[Auth] Device code request threw:", networkError);
      const detail =
        networkError instanceof Error ? networkError.message : "network error";
      throw new Error(
        `Couldn't reach the sign-in service (${detail}). The server may be blocking the request, or the device-code endpoint may not be enabled.`,
      );
    }

    const { data, error } = result;
    if (error || !data) {
      if (DEBUG_AUTH) console.log("[Auth] Device code error:", error);
      const err = error as unknown as Record<string, unknown> | null;
      const status =
        typeof err?.status === "number" ? ` (HTTP ${err.status})` : "";
      const detail =
        (typeof err?.error_description === "string" && err.error_description) ||
        (typeof err?.message === "string" && err.message) ||
        (typeof err?.statusText === "string" && err.statusText) ||
        "the server rejected the request";
      throw new Error(`Couldn't get a sign-in code${status}: ${detail}`);
    }
    return result.data as DeviceCodeResponse;
  }

  /**
   * Poll /api/auth/device/token until the user approves on the browser.
   * Uses setTimeout + reschedule so slow_down backoff is preserved across ticks.
   * Handles authorization_pending (continue), slow_down (back off),
   * access_denied and expired_token (terminal failures).
   */
  async function startDeviceTokenPolling(
    deviceCode: string,
    onTerminalError?: (
      code: "expired" | "access_denied" | "server_down",
    ) => void,
  ): Promise<void> {
    let pollInterval = AUTH_POLL_INTERVAL;
    // Bound each poll request and treat persistent network failures as a
    // terminal server_down instead of silently retrying until AUTH_TIMEOUT.
    let consecutiveNetworkFailures = 0;
    const MAX_CONSECUTIVE_POLL_FAILURES = 3;
    const POLL_REQUEST_TIMEOUT_MS = 10000;
    // Rate limiting is transient, so back off rather than failing instantly —
    // but do NOT let it run silently to AUTH_TIMEOUT. better-auth 1.6.21 stops
    // guessing the client IP from a multi-hop X-Forwarded-For unless
    // `advanced.ipAddress.trustedProxies` is configured, and falls back to ONE
    // shared rate-limit bucket for every client. Behind a proxy that turns
    // normal poll traffic into 429s, which used to look like a five-minute
    // hang ending in a misleading "expired".
    let consecutiveRateLimits = 0;
    const MAX_CONSECUTIVE_RATE_LIMITS = 3;

    const doPoll = async () => {
      if (!server) return;

      try {
        if (DEBUG_AUTH) console.log("[Auth] Polling device token...");

        // Use raw fetch for direct access to the RFC 8628 response body.
        // Abort a single stalled poll so it can't block the next one.
        const controller = new AbortController();
        const pollTimeout = setTimeout(
          () => controller.abort(),
          POLL_REQUEST_TIMEOUT_MS,
        );
        let response: Response;
        try {
          response = await fetch(`${server}/api/auth/device/token`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Same CSRF-origin workaround as the better-auth client: a stale
              // cookie + no Origin header would 403 this POST too. See authClient.
              Origin: serverOrigin(server),
            },
            body: JSON.stringify({
              grant_type: "urn:ietf:params:oauth:grant-type:device_code",
              device_code: deviceCode,
              client_id: "mobile-app",
            }),
            signal: controller.signal,
            credentials: "omit",
          });
        } finally {
          clearTimeout(pollTimeout);
        }
        // Network round-trip succeeded — reset the failure counter.
        consecutiveNetworkFailures = 0;

        const rawText = await response.text();
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          if (DEBUG_AUTH)
            console.log(
              "[Auth] Token response non-JSON (likely Apache ProxyErrorOverride replacing authorization_pending), status:",
              response.status,
            );
          // 5xx: server is down — stop polling and notify caller
          if (response.status >= 500) {
            stopAuthPolling();
            setIsAuthenticating(false);
            onTerminalError?.("server_down");
            return;
          }
          // Other non-JSON (e.g. 2xx/3xx/4xx without a body) — treat as authorization_pending
          scheduleNextPoll();
          return;
        }

        if (DEBUG_AUTH) {
          console.log("[Auth] Device token response:", response.status, body);
        }

        if (!response.ok) {
          const errorCode = body.error as string | undefined;
          if (DEBUG_AUTH)
            console.log(
              "[Auth] Device token error code:",
              errorCode,
              "status:",
              response.status,
            );

          if (errorCode === "slow_down") {
            pollInterval = Math.min(pollInterval * 2, 30000);
            if (DEBUG_AUTH)
              console.log("[Auth] slow_down, new interval:", pollInterval);
            scheduleNextPoll();
            return;
          }

          // Rate limited: back off like slow_down, but give up after a few in
          // a row rather than spinning to AUTH_TIMEOUT. See the
          // trustedProxies note where consecutiveRateLimits is declared.
          if (response.status === 429) {
            consecutiveRateLimits++;
            console.warn(
              `[Auth] Device token poll rate limited (429), ${consecutiveRateLimits}/${MAX_CONSECUTIVE_RATE_LIMITS}`,
            );
            if (consecutiveRateLimits >= MAX_CONSECUTIVE_RATE_LIMITS) {
              stopAuthPolling();
              setIsAuthenticating(false);
              onTerminalError?.("server_down");
              return;
            }
            pollInterval = Math.min(pollInterval * 2, 30000);
            scheduleNextPoll();
            return;
          }
          consecutiveRateLimits = 0;

          // `invalid_request` is a protocol/server-configuration failure, not a
          // pending authorization, so polling can never resolve it.
          //
          // better-auth 1.6.11 (CVE-2026-45337) made POST /device/approve
          // reject with 400 invalid_request unless the device-code row was
          // first CLAIMED by GET /device?user_code=... from an already
          // signed-in session. A verification page that renders the code
          // before the user logs in never claims it, so approval fails and the
          // code stays pending forever. Falling through to "keep polling" here
          // meant five minutes of spinning followed by "expired" — which points
          // debugging at code expiry instead of at approval.
          if (errorCode === "invalid_request") {
            console.warn(
              "[Auth] Device token poll returned invalid_request — the device code was likely never claimed by the verification page (better-auth >= 1.6.11 requires GET /device?user_code=... from a signed-in session before approve). Not recoverable by polling.",
            );
            stopAuthPolling();
            setIsAuthenticating(false);
            onTerminalError?.("server_down");
            return;
          }

          if (
            errorCode === "access_denied" ||
            errorCode === "expired_token" ||
            errorCode === "invalid_grant"
          ) {
            // Terminal errors — stop polling
            stopAuthPolling();
            setIsAuthenticating(false);
            if (
              errorCode === "expired_token" ||
              errorCode === "invalid_grant"
            ) {
              if (DEBUG_AUTH)
                console.log("[Auth] Device code expired, notifying caller");
              onTerminalError?.("expired");
            } else if (errorCode === "access_denied") {
              if (DEBUG_AUTH)
                console.log("[Auth] Access denied, notifying caller");
              onTerminalError?.("access_denied");
            }
            return;
          }
          // authorization_pending or any other non-terminal error — keep polling
          scheduleNextPoll();
          return;
        }

        const accessToken = body.access_token as string | undefined;
        if (!accessToken) {
          scheduleNextPoll();
          return;
        }

        // Success — stop polling and complete auth
        stopAuthPolling();
        try {
          await completeAuthentication(accessToken);
        } catch (completeError: unknown) {
          // Got a token but the session fetch failed/was malformed (e.g. a
          // proxy error page). Surface it instead of rescheduling, which would
          // hang until AUTH_TIMEOUT.
          if (DEBUG_AUTH)
            console.error(
              "[Auth] Failed to complete authentication:",
              completeError,
            );
          setIsAuthenticating(false);
          onTerminalError?.("server_down");
        }
      } catch (error: unknown) {
        if (DEBUG_AUTH) console.error("[Auth] Error during token poll:", error);
        // The fetch itself failed (network/abort). After a few consecutive
        // failures, treat the server as unreachable rather than retrying
        // silently until AUTH_TIMEOUT.
        consecutiveNetworkFailures += 1;
        if (consecutiveNetworkFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          if (DEBUG_AUTH)
            console.log(
              "[Auth] Too many consecutive poll failures — treating as server_down",
            );
          stopAuthPolling();
          setIsAuthenticating(false);
          onTerminalError?.("server_down");
          return;
        }
        // Transient error — keep polling
        scheduleNextPoll();
      }
    };

    const scheduleNextPoll = () => {
      // Guard: don't reschedule if the overall timeout has already fired
      if (!authTimeoutTimer.current && authPollInterval.current === null)
        return;
      authPollInterval.current = setTimeout(
        doPoll,
        pollInterval,
      ) as unknown as ReturnType<typeof setInterval>;
    };

    // Set the overall timeout first so scheduleNextPoll's guard works correctly
    authTimeoutTimer.current = setTimeout(() => {
      if (DEBUG_AUTH)
        console.log(
          `[Auth] Authentication timed out after ${AUTH_TIMEOUT / 1000}s`,
        );
      stopAuthPolling();
      setIsAuthenticating(false);
      onTerminalError?.("expired");
    }, AUTH_TIMEOUT);

    // Kick off the first poll
    scheduleNextPoll();
  }

  /** Fetch the session for the newly-issued token, or null if not (yet) recognized. */
  async function fetchSession(
    token: string,
  ): Promise<GetSessionResponse | null> {
    const sessionResp = await fetch(
      `${server}${API_ENDPOINTS.AUTH.GET_SESSION}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!sessionResp.ok) {
      throw new Error(
        `Failed to fetch session after auth: ${sessionResp.status}`,
      );
    }
    try {
      // better-auth returns 200 with a bare `null` body (not a 401) when the
      // session isn't recognized — e.g. a freshly-issued token that hasn't
      // propagated to the get-session read path yet.
      return (await sessionResp.json()) as GetSessionResponse | null;
    } catch {
      // Non-JSON body (e.g. reverse-proxy error page returned with a 200).
      throw new Error("Invalid session response from server");
    }
  }

  /** Fetch the session for the given token and persist auth state */
  async function completeAuthentication(token: string): Promise<void> {
    let sessionData: GetSessionResponse | null;
    try {
      sessionData = await fetchSession(token);
    } catch {
      // Fall through to the same retry as a bare-null response — a thrown
      // error (bad status, non-JSON body) on a just-issued token is just as
      // likely to be transient propagation lag as a clean null is.
      sessionData = null;
    }
    if (!sessionData?.user) {
      // Retry once after a short delay to absorb propagation lag on a
      // just-issued token before surfacing this as a hard failure.
      await new Promise((resolve) => setTimeout(resolve, 800));
      sessionData = await fetchSession(token); // second failure propagates for real
    }
    if (!sessionData?.user) {
      throw new Error("No session returned after authentication");
    }
    const u: User = {
      ...sessionData.user,
      admin: sessionData.user.role === "admin",
    };

    if (DEBUG_AUTH)
      console.log(`[Auth] Authenticated as: ${u.name || "unknown"}`);

    setUser(u);
    setAccessToken(token);
    userRef.current = u;
    accessTokenRef.current = token;
    // A fresh sign-in retires any "your session ended" notice.
    setSessionExpired(false);
    await persist(server, u, token);
    setIsAuthenticating(false);
  }

  /** TV QR code flow — request a device code and return it for QR rendering */
  async function signInWithQRCode(): Promise<DeviceCodeResponse> {
    if (!server) throw new Error("Must call setServer first");

    try {
      stopAuthPolling();
      if (DEBUG_AUTH) console.log("[Auth] Starting QR code auth flow");
      const deviceData = await requestDeviceCode();
      if (DEBUG_AUTH)
        console.log("[Auth] Device code obtained:", deviceData.user_code);
      return deviceData;
    } catch (error: unknown) {
      console.error("[Auth] QR session registration error:", error);
      throw error;
    }
  }

  /** Poll for QR/device auth completion after displaying the QR code */
  async function pollQRAuthentication(
    deviceCode: string,
    onTerminalError?: (
      code: "expired" | "access_denied" | "server_down",
    ) => void,
  ): Promise<void> {
    if (!server) throw new Error("Must call setServer first");
    // Guard: if already authenticated, don't restart polling (prevents spurious
    // re-runs caused by function reference changes after auth completes)
    if (user && accessToken) return;

    try {
      stopAuthPolling();
      setIsAuthenticating(true);
      if (DEBUG_AUTH)
        console.log("[Auth] Starting QR token polling for device:", deviceCode);

      await startDeviceTokenPolling(deviceCode, onTerminalError);
    } catch (error: unknown) {
      console.error("[Auth] QR authentication polling error:", error);
      stopAuthPolling();
      setIsAuthenticating(false);
      throw error;
    }
  }

  const cancelQRAuthentication = () => {
    if (DEBUG_AUTH)
      console.log("[Auth] Cancelling QR authentication and stopping polling");
    stopAuthPolling();
    setIsAuthenticating(false);
  };

  /**
   * Verify the session is still usable. Kept as its own name because the
   * axios 401 interceptor and the context both consume it, but it is now just
   * the shared probe — which owns the sign-out decision itself.
   */
  const refreshToken = async (): Promise<boolean> => {
    if (DEBUG_AUTH)
      console.log("[Auth] Verifying session validity via get-session");
    return probeSession();
  };

  /**
   * Clear all local auth data and invalidate the session server-side.
   *
   * Local state is cleared FIRST and the server call happens after. The route
   * guards key off `user`, so clearing first is what actually evicts someone
   * from a protected screen; awaiting a POST to a server that may be gone
   * (bounded, but still up to SESSION_FETCH_TIMEOUT_MS) would leave them
   * sitting on a dead screen for that whole window.
   *
   * Safe to call concurrently and repeatedly — a burst of 401s all landing at
   * once must produce exactly one sign-out.
   */
  const signOut = async (options?: { reason?: "session-invalidated" }) => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;

    try {
      stopStatusChecking();
      stopAuthPolling();
      stopServerRecoveryChecking();

      // Capture before clearing — the server call below still needs them.
      const priorServer = serverRef.current;
      const priorToken = accessTokenRef.current;

      // 1) Local state first, so the guards redirect immediately.
      setUser(null);
      setAccessToken(null);
      setIsAuthenticating(false);
      setIsServerDown(false);
      setServerStatusMessage(null);
      setSessionExpired(options?.reason === "session-invalidated");
      userRef.current = null;
      accessTokenRef.current = null;

      // Rebuild the per-server auth client rather than dropping it. Nulling it
      // used to strand the user: `server` stays set, so the QR screen is
      // reachable, but requestDeviceCode() would throw "Sign-in isn't ready"
      // because only setServer() ever recreated the client — meaning a forced
      // sign-out could only be recovered by re-typing the host.
      betterAuthClient.current = priorServer
        ? createBetterAuthClient(priorServer)
        : null;

      // 2) Cache hygiene. Cancel in-flight queries before clearing so nothing
      // resolves into a cleared cache and repopulates it with the old user's
      // data. Each step is isolated: a failure in one must not skip the rest.
      try {
        cacheStore.clear();
      } catch (e) {
        console.warn("[Auth] cacheStore clear failed during sign-out", e);
      }
      try {
        await clearAllCaches();
      } catch (e) {
        console.warn("[Auth] query cache clear failed during sign-out", e);
      }
      try {
        useBackdropStore.getState().reset();
      } catch (e) {
        console.warn("[Auth] backdrop reset failed during sign-out", e);
      }

      // 3) Persist the cleared blob. If this throws, the dead token would
      // survive a restart, so it must not be able to skip anything above.
      try {
        await persist(priorServer, null, null);
      } catch (e) {
        console.warn("[Auth] Failed to persist cleared auth state", e);
      }

      // 4) Best-effort server-side invalidation, last. better-auth's
      // /sign-out needs no valid session and is idempotent, so this is safe
      // even when the session is already gone.
      if (priorServer && priorToken) {
        try {
          await fetchWithTimeout(
            `${priorServer}${API_ENDPOINTS.AUTH.SIGN_OUT}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${priorToken}`,
                Origin: serverOrigin(priorServer),
              },
              credentials: "omit",
            },
          );
        } catch {
          // Ignore — local state is already cleared, which is what matters.
        }
      }
    } finally {
      signingOutRef.current = false;
    }
  };

  // ── Stable identities for everything exposed on the context.
  //
  // The implementations above are re-created on every render because they
  // close over state, and consumers put them in effect dependency arrays —
  // pending-approval.tsx rebuilds its poll interval every render for exactly
  // this reason, and useLoginLogic's device-flow effect re-runs on it too.
  // Dispatching through a ref keeps the exported functions referentially
  // stable for the life of the provider while still calling the current
  // implementation.
  const impl = useRef({
    setServer,
    signInWithProvider,
    signInWithQRCode,
    pollQRAuthentication,
    cancelQRAuthentication,
    signOut,
    refreshUserStatus,
    refreshToken,
  });
  impl.current = {
    setServer,
    signInWithProvider,
    signInWithQRCode,
    pollQRAuthentication,
    cancelQRAuthentication,
    signOut,
    refreshUserStatus,
    refreshToken,
  };

  const stableSetServer = useCallback(
    (url: string) => impl.current.setServer(url),
    [],
  );
  const stableSignInWithProvider = useCallback(
    (providerId: string) => impl.current.signInWithProvider(providerId),
    [],
  );
  const stableSignInWithQRCode = useCallback(
    () => impl.current.signInWithQRCode(),
    [],
  );
  const stablePollQRAuthentication = useCallback(
    (
      deviceCode: string,
      onTerminalError?: (
        code: "expired" | "access_denied" | "server_down",
      ) => void,
    ) => impl.current.pollQRAuthentication(deviceCode, onTerminalError),
    [],
  );
  const stableCancelQRAuthentication = useCallback(
    () => impl.current.cancelQRAuthentication(),
    [],
  );
  // Exposed without the options param: everything reaching the context is a
  // user-initiated sign-out, which must not raise the "session ended" notice.
  const stableSignOut = useCallback(() => impl.current.signOut(), []);
  const stableRefreshUserStatus = useCallback(
    () => impl.current.refreshUserStatus(),
    [],
  );
  const stableRefreshToken = useCallback(() => impl.current.refreshToken(), []);
  const clearSessionExpiredNotice = useCallback(
    () => setSessionExpired(false),
    [],
  );

  return (
    <AuthContext.Provider
      value={{
        ready,
        apiReady,
        server,
        setServer: stableSetServer,
        signInWithProvider: stableSignInWithProvider,
        signInWithQRCode: stableSignInWithQRCode,
        pollQRAuthentication: stablePollQRAuthentication,
        cancelQRAuthentication: stableCancelQRAuthentication,
        user,
        signOut: stableSignOut,
        refreshUserStatus: stableRefreshUserStatus,
        isRefreshing,
        isAuthenticating,
        refreshToken: stableRefreshToken,
        isServerDown,
        serverStatusMessage,
        sessionExpired,
        clearSessionExpiredNotice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
