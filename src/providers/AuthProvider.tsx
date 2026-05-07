// app/providers/AuthProvider.tsx
import { SplashScreen } from "expo-router";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  PropsWithChildren,
} from "react";
import { AppState, AppStateStatus } from "react-native";

import {
  createBetterAuthClient,
  type BetterAuthClient,
} from "@/src/data/api/authClient";
import { API_ENDPOINTS } from "@/src/data/api/endpoints";
import { enhancedApiClient } from "@/src/data/api/enhancedClient";
import { cacheStore } from "@/src/data/cache/cacheStore";
import type {
  DeviceCodeResponse,
  GetSessionResponse,
} from "@/src/data/types/auth.types";
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
}

const STORAGE_KEY = "auth-info";
const STATUS_CHECK_INTERVAL = 30000; // 30 seconds
/** Server requires minimum 5s polling interval per deviceAuthorization config */
const AUTH_POLL_INTERVAL = 5000;
const AUTH_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Enable for detailed auth flow logging
const DEBUG_AUTH = __DEV__;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

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

  // 3️⃣ Start/stop status checking based on auth state
  useEffect(() => {
    if (server && user && accessToken) {
      startStatusChecking();
    } else {
      stopStatusChecking();
    }

    return () => stopStatusChecking();
  }, [server, user, accessToken]);

  // 4️⃣ Handle app state changes (check status when app becomes active)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active" &&
        user &&
        accessToken
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
  }, [user, accessToken]);

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
    if (!server) return;
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

  /** Fetch current session from server, update user state */
  const refreshUserStatus = async () => {
    if (!server || !accessToken || isRefreshing) return;

    setIsRefreshing(true);
    try {
      const response = await fetch(
        `${server}${API_ENDPOINTS.AUTH.GET_SESSION}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (!response.ok) {
        if (DEBUG_AUTH)
          console.log(`[Auth] Status check returned error: ${response.status}`);

        if (response.status === 401 || response.status === 403) {
          console.log("[Auth] Session expired, attempting token refresh");
          const refreshSuccessful = await refreshToken();
          if (!refreshSuccessful) {
            console.log("[Auth] Token refresh failed, logging out");
            await signOut();
          }
          return;
        }

        if (response.status >= 500) {
          console.warn("[Auth] Server error detected, checking server status");
          await checkServerStatus();
        }
        throw new Error(`Status check failed: ${response.status}`);
      }

      const data = (await response.json()) as GetSessionResponse;

      // Normalise admin field from role
      const updatedUser: User = {
        ...data.user,
        admin: data.user.role === "admin",
      };

      if (JSON.stringify(updatedUser) !== JSON.stringify(user)) {
        if (DEBUG_AUTH) console.log("[Auth] User data changed, updating state");
        setUser(updatedUser);
        await persist(server, updatedUser, accessToken);
      }
    } catch (error: unknown) {
      console.warn("[Auth] Status check failed:", error);
      if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string" &&
        (error.message.includes("fetch failed") ||
          error.message.includes("Network Error"))
      ) {
        console.warn("[Auth] Network issue detected, checking server status");
        await checkServerStatus();
      }
    } finally {
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

      await startDeviceTokenPolling(device_code);
    } catch (error: unknown) {
      console.error("[Auth] Authentication error:", error);
      stopAuthPolling();
      setIsAuthenticating(false);
      throw error;
    }
  }

  /** Request a device code from the server */
  async function requestDeviceCode(): Promise<DeviceCodeResponse> {
    const client = betterAuthClient.current;
    if (!client)
      throw new Error("Auth client not initialised — call setServer first");

    const { data, error } = await client.device.code({
      client_id: "mobile-app",
    });
    if (error || !data) {
      if (DEBUG_AUTH) console.log("[Auth] Device code error:", error);
      throw new Error(
        `Failed to get device code: ${error?.error_description ?? error?.statusText ?? "unknown"}`,
      );
    }
    return data as DeviceCodeResponse;
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

    const doPoll = async () => {
      if (!server) return;

      try {
        if (DEBUG_AUTH) console.log("[Auth] Polling device token...");

        // Use raw fetch for direct access to the RFC 8628 response body.
        const response = await fetch(`${server}/api/auth/device/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: deviceCode,
            client_id: "mobile-app",
          }),
        });

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
        await completeAuthentication(accessToken);
      } catch (error: unknown) {
        if (DEBUG_AUTH) console.error("[Auth] Error during token poll:", error);
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

  /** Fetch the session for the given token and persist auth state */
  async function completeAuthentication(token: string): Promise<void> {
    const sessionResp = await fetch(
      `${server}${API_ENDPOINTS.AUTH.GET_SESSION}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!sessionResp.ok) {
      throw new Error(
        `Failed to fetch session after auth: ${sessionResp.status}`,
      );
    }
    const sessionData = (await sessionResp.json()) as GetSessionResponse;
    const u: User = {
      ...sessionData.user,
      admin: sessionData.user.role === "admin",
    };

    if (DEBUG_AUTH)
      console.log(`[Auth] Authenticated as: ${u.name || "unknown"}`);

    setUser(u);
    setAccessToken(token);
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
   * better-auth sessions auto-refresh within the updateAge window (24h).
   * A 401 means the 30-day session has expired — sign out.
   */
  const refreshToken = async (): Promise<boolean> => {
    if (!server || !accessToken) return false;

    if (DEBUG_AUTH)
      console.log("[Auth] Verifying session validity via get-session");

    try {
      const resp = await fetch(`${server}${API_ENDPOINTS.AUTH.GET_SESSION}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (resp.ok) {
        if (DEBUG_AUTH) console.log("[Auth] Session still valid");
        return true;
      }
      if (DEBUG_AUTH)
        console.log(
          "[Auth] Session expired (status:",
          resp.status,
          "), signing out",
        );
      await signOut();
      return false;
    } catch (error: unknown) {
      if (DEBUG_AUTH)
        console.error("[Auth] Error during session check:", error);
      return false;
    }
  };

  /** Invalidate server session and clear all local auth data */
  const signOut = async () => {
    stopStatusChecking();
    stopAuthPolling();
    stopServerRecoveryChecking();

    // Best-effort server-side session invalidation
    if (server && accessToken) {
      try {
        await fetch(`${server}${API_ENDPOINTS.AUTH.SIGN_OUT}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        // Ignore — we still clear local state
      }
    }

    setUser(null);
    setAccessToken(null);
    setIsAuthenticating(false);
    setIsServerDown(false);
    setServerStatusMessage(null);
    await persist(server, null, null);

    cacheStore.clear();
    useBackdropStore.getState().reset();
  };

  return (
    <AuthContext.Provider
      value={{
        ready,
        apiReady,
        server,
        setServer,
        signInWithProvider,
        signInWithQRCode,
        pollQRAuthentication,
        cancelQRAuthentication,
        user,
        signOut,
        refreshUserStatus,
        isRefreshing,
        isAuthenticating,
        refreshToken,
        isServerDown,
        serverStatusMessage,
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
