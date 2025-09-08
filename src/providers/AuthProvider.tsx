// app/providers/AuthProvider.tsx
import { SplashScreen } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  PropsWithChildren,
} from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import "react-native-get-random-values"; // Required for UUID generation
import { v4 as uuidv4 } from "uuid";

import { API_ENDPOINTS } from "@/src/data/api/endpoints";
import { enhancedApiClient } from "@/src/data/api/enhancedClient";
import { cacheStore } from "@/src/data/cache/cacheStore";
import type {
  QRSessionRequest,
  QRSessionResponse,
  QRTokenCheckResponse,
} from "@/src/data/types/auth.types";
import { getDeviceInfo, getDeviceType } from "@/src/utils/deviceInfo";
import { useBackdropStore } from "@/src/stores/backdropStore";

type User = {
  id: string;
  name: string;
  email: string;
  approved: boolean;
  limitedAccess?: boolean;
  admin?: boolean;
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
  /** once server is set, pick a provider id from /api/auth/providers */
  signInWithProvider: (providerId: string) => Promise<void>;
  /** QR code authentication flow for TV */
  signInWithQRCode: () => Promise<QRSessionResponse>;
  /** Poll for QR authentication completion */
  pollQRAuthentication: (qrSessionId: string) => Promise<void>;
  /** Cancel QR authentication and stop polling */
  cancelQRAuthentication: () => void;
  /** full user profile, or null if logged out */
  user: User | null;
  /** logs you out locally (doesn't hit the server) */
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

interface SessionResponse {
  sessionId: string;
  expiresAt: number;
}

interface TokenCheckResponse {
  status: "pending" | "complete" | "expired";
  tokens?: {
    user: User;
    mobileSessionToken: string;
    sessionId: string;
  };
}

interface TokenRefreshResponse {
  success: boolean;
  mobileSessionToken?: string;
  user?: User;
  error?: string;
}

const STORAGE_KEY = "auth-info";
const CLIENT_ID_KEY = "client-id";
const STATUS_CHECK_INTERVAL = 30000; // 30 seconds
const AUTH_POLL_INTERVAL = 2000; // 2 seconds
const AUTH_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const TOKEN_REFRESH_ATTEMPTS = 3; // Maximum number of token refresh attempts before logging out

// Enable for detailed auth flow logging
const DEBUG_AUTH = __DEV__;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [server, setServerRaw] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [mobileToken, setMobileToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
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

  // Helper to generate a UUID for client identification
  const generateClientId = (): string => uuidv4();

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
          const {
            server: s,
            user: u,
            mobileToken: t,
            sessionId: sid,
          } = JSON.parse(raw);
          setServerRaw(s);
          setUser(u);
          setMobileToken(t);
          setSessionId(sid);

          // If we restored a valid user session, ensure we navigate to the proper platform view
          // Use a slight delay to ensure the navigation happens after state is updated
          // if (u && t && sid) {
          //   if (DEBUG_AUTH) {
          //     console.log(`[Auth] Navigating to ${Platform.isTV ? 'TV' : 'Mobile'} view after rehydration`);
          //   }
          //   router.replace((Platform.isTV ? '/(tv)/' : '/(mobile)/') as any);
          // }
        }

        // Ensure we have a client ID
        let clientId: string | null =
          await SecureStore.getItemAsync(CLIENT_ID_KEY);
        if (!clientId) {
          clientId = generateClientId();
          await SecureStore.setItemAsync(CLIENT_ID_KEY, clientId);
          if (DEBUG_AUTH) {
            console.log(`[Auth] Generated new client ID: ${clientId}`);
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
    if (server && user && mobileToken && sessionId) {
      startStatusChecking();
    } else {
      stopStatusChecking();
    }

    return () => stopStatusChecking();
  }, [server, user, mobileToken, sessionId]);

  // 4️⃣ Handle app state changes (check status when app becomes active)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active" &&
        user &&
        mobileToken
      ) {
        // App has come to the foreground, check user status immediately
        refreshUserStatus();
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription?.remove();
  }, [user, mobileToken]);

  // 5️⃣ Ensure polling stops when user becomes authenticated (but not during active auth)
  useEffect(() => {
    // Only stop polling if user is fully authenticated AND we're not currently authenticating
    if (user && mobileToken && sessionId && !isAuthenticating) {
      if (DEBUG_AUTH) {
        console.log(
          "[Auth] User authenticated and not currently authenticating, stopping any active polling",
        );
      }

      // User is authenticated, make sure polling is stopped
      stopAuthPolling();
    }
  }, [user, mobileToken, sessionId, isAuthenticating]);

  // 6️⃣ Configure API client based on authentication state
  useEffect(() => {
    if (server && (mobileToken || sessionId)) {
      if (DEBUG_AUTH) {
        console.log(
          "[Auth] Configuring API client with server, token, and session ID",
        );
      }

      // Configure the API client with the authenticated server and credentials
      enhancedApiClient.setBaseUrl(server);

      // Set both authentication methods
      if (mobileToken) {
        enhancedApiClient.setAuthToken(mobileToken);
      }

      if (sessionId) {
        enhancedApiClient.setSessionId(sessionId);
      }

      // Set the token refresh callback so axios can handle 401 errors automatically
      enhancedApiClient.setTokenRefreshCallback(refreshToken);

      // Set the server status check callback so axios can handle server errors
      enhancedApiClient.setServerStatusCheckCallback(checkServerStatus);

      // When credentials are refreshed, invalidate user-specific cached data
      // This ensures we prefer fresh data after re-authentication
      cacheStore.invalidateUserSpecificCache();

      // Mark API as ready now that it's fully configured
      setApiReady(true);

      if (DEBUG_AUTH) {
        console.log("[Auth] API client is now ready for requests");
      }
    } else {
      if (DEBUG_AUTH) {
        console.log("[Auth] Clearing API client configuration");
      }

      // Clear API client configuration when not authenticated
      enhancedApiClient.setBaseUrl(null);
      enhancedApiClient.setAuthToken(null);
      enhancedApiClient.setSessionId(null);
      enhancedApiClient.setTokenRefreshCallback(null);

      // Mark API as not ready
      setApiReady(false);
    }
  }, [server, mobileToken, sessionId]);

  // 7️⃣ Cleanup on component unmount
  useEffect(() => {
    return () => {
      // Component will unmount, clean up all intervals and timers
      stopStatusChecking();
      stopAuthPolling();
    };
  }, []); // Empty dependency array ensures this only runs on mount/unmount

  // Helper to persist auth data
  const persist = async (
    s: string | null,
    u: User | null,
    t: string | null,
    sid: string | null,
  ) => {
    await SecureStore.setItemAsync(
      STORAGE_KEY,
      JSON.stringify({ server: s, user: u, mobileToken: t, sessionId: sid }),
    );
  };

  // Start periodic status checking
  const startStatusChecking = () => {
    stopStatusChecking(); // Clear any existing interval

    statusCheckInterval.current = setInterval(() => {
      refreshUserStatus();
    }, STATUS_CHECK_INTERVAL);

    // Also check immediately
    refreshUserStatus();
  };

  // Stop status checking
  const stopStatusChecking = () => {
    if (statusCheckInterval.current) {
      clearInterval(statusCheckInterval.current);
      statusCheckInterval.current = null;
    }
    // Also stop recovery checking when stopping all status checking
    stopServerRecoveryChecking();
  };

  // Start server recovery checking when server is down
  const startServerRecoveryChecking = () => {
    stopServerRecoveryChecking(); // Clear any existing interval

    if (DEBUG_AUTH) {
      console.log("[Auth] Starting server recovery checking");
    }

    // Check every 10 seconds when server is down
    serverRecoveryInterval.current = setInterval(() => {
      if (DEBUG_AUTH) {
        console.log("[Auth] Checking if server has recovered");
      }
      checkServerStatus();
    }, 10000);
  };

  // Stop server recovery checking
  const stopServerRecoveryChecking = () => {
    if (serverRecoveryInterval.current) {
      if (DEBUG_AUTH) {
        console.log("[Auth] Stopping server recovery checking");
      }
      clearInterval(serverRecoveryInterval.current);
      serverRecoveryInterval.current = null;
    }
  };

  // Stop auth polling
  const stopAuthPolling = () => {
    if (DEBUG_AUTH) {
      console.log("[Auth] Stopping all auth polling");
    }

    if (authPollInterval.current) {
      clearInterval(authPollInterval.current);
      authPollInterval.current = null;
    }

    if (authTimeoutTimer.current) {
      clearTimeout(authTimeoutTimer.current);
      authTimeoutTimer.current = null;
    }
  };

  // Check server status using enhanced client
  const checkServerStatus = async (): Promise<void> => {
    if (!server) return;

    try {
      if (DEBUG_AUTH) {
        console.log("[Auth] Checking server status via enhanced client");
      }

      const statusSummary = await enhancedApiClient.checkServerStatus();

      if (!statusSummary) {
        // This shouldn't happen, but handle it gracefully
        setIsServerDown(true);
        setServerStatusMessage("Unable to determine server status");
        return;
      }

      if (statusSummary.isNextJSAppDown) {
        setIsServerDown(true);
        setServerStatusMessage(statusSummary.message);
        // Start recovery checking when server goes down
        startServerRecoveryChecking();
        if (DEBUG_AUTH) {
          console.log("[Auth] NextJS app is down:", statusSummary.message);
          console.log("[Auth] Setting server status state:", {
            isServerDown: true,
            message: statusSummary.message,
          });
        }
      } else {
        setIsServerDown(false);
        // Stop recovery checking when server is back up
        stopServerRecoveryChecking();

        if (statusSummary.hasServerIssues) {
          // NextJS is up but some backend servers have issues
          setServerStatusMessage(statusSummary.message);
          if (DEBUG_AUTH) {
            console.log(
              "[Auth] Server issues detected:",
              statusSummary.message,
            );
            console.log("[Auth] Affected servers:", statusSummary.serverIssues);
            console.log("[Auth] Setting server status state:", {
              isServerDown: false,
              message: statusSummary.message,
            });
          }
        } else {
          // All systems operational
          setServerStatusMessage(null);
          if (DEBUG_AUTH) {
            console.log("[Auth] All systems operational");
            console.log("[Auth] Setting server status state:", {
              isServerDown: false,
              message: null,
            });
          }
        }
      }
    } catch (error) {
      console.error("[Auth] Server status check failed:", error);
      setIsServerDown(true);
      setServerStatusMessage(
        "Server status check failed. Attempting to reconnect.",
      );
      // Start recovery checking when server status check fails
      startServerRecoveryChecking();
      if (DEBUG_AUTH) {
        console.log("[Auth] Setting server status state due to error:", {
          isServerDown: true,
          message: "Server status check failed. Attempting to reconnect.",
        });
      }
    }
  };

  // Check user status against server
  const refreshUserStatus = async () => {
    if (!server || !mobileToken || isRefreshing) return;

    setIsRefreshing(true);
    try {
      const response = await fetch(`${server}/api/auth/user-status`, {
        headers: {
          Authorization: `Bearer ${mobileToken}`,
        },
      });

      // Handle various error status codes
      if (!response.ok) {
        if (DEBUG_AUTH) {
          console.log(`[Auth] Status check returned error: ${response.status}`);
        }

        let errorData: Record<string, unknown> = {};
        try {
          errorData = await response.json();
        } catch (e) {
          // Error response may not contain valid JSON
          console.warn("Error parsing status check error response", e);
        }

        // Check for common session expiration indicators
        const sessionExpired =
          errorData.sessionExpired ||
          errorData.expired ||
          errorData.revoked ||
          errorData.invalid ||
          response.status === 401 || // Unauthorized
          response.status === 403; // Forbidden

        if (sessionExpired) {
          console.log(
            "[Auth] Session detected as expired or revoked, attempting token refresh",
          );
          // Try to refresh the token before logging out
          const refreshSuccessful = await refreshToken();

          if (refreshSuccessful) {
            if (DEBUG_AUTH) {
              console.log(
                "[Auth] Token refresh successful, continuing with refreshed token",
              );
            }
            // Token refresh worked, continue with normal operation
            return;
          } else {
            // Token refresh failed, proceed with logout
            console.log("[Auth] Token refresh failed, logging out");
            await signOut();
            return;
          }
        }

        // For server errors (5xx), check server status
        if (response.status >= 500) {
          console.warn("[Auth] Server error detected, checking server status");
          await checkServerStatus();
        }

        throw new Error(`Status check failed: ${response.status}`);
      }

      // Handle successful response
      const data = await response.json();

      // Check if response indicates session is revoked or invalid
      // Server might return 200 OK with a status flag in the response
      if (
        data.sessionRevoked ||
        data.sessionExpired ||
        data.revoked ||
        data.expired ||
        data.status === "invalid" ||
        data.valid === false
      ) {
        console.log(
          "[Auth] Server indicated session is revoked or invalid, attempting token refresh",
        );
        // Try to refresh the token before logging out
        const refreshSuccessful = await refreshToken();

        if (refreshSuccessful) {
          if (DEBUG_AUTH) {
            console.log(
              "[Auth] Token refresh successful, continuing with refreshed token",
            );
          }
          // Token refresh worked, continue with normal operation
          return;
        } else {
          // Token refresh failed, proceed with logout
          console.log("[Auth] Token refresh failed, logging out");
          await signOut();
          return;
        }
      }

      // Update user data if it has changed
      if (JSON.stringify(data.user) !== JSON.stringify(user)) {
        if (DEBUG_AUTH) {
          console.log("[Auth] User data changed, updating local state");
        }
        setUser(data.user);
        await persist(server, data.user, mobileToken, sessionId);
      }
    } catch (error: unknown) {
      console.warn("[Auth] Status check failed:", error);

      // Check if this is a server connectivity issue
      if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string" &&
        (error.message.includes("fetch failed") ||
          error.message.includes("Network Error"))
      ) {
        console.warn("[Auth] Network issue detected, checking server status");
        // Check server status to determine if it's a general server issue
        await checkServerStatus();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  /** 5️⃣ Call this with your validated host */
  const setServer = async (url: string) => {
    setServerRaw(url);
    await persist(url, user, mobileToken, sessionId);
  };

  /** 6️⃣ Kick off session-based authentication flow */
  async function signInWithProvider(providerId: string) {
    if (!server) throw new Error("Must call setServer first");

    // Prevent web browser authentication on tvOS since expo-web-browser is not supported
    if (Platform.isTVOS) {
      throw new Error(
        "Web browser authentication is not supported on tvOS. Please use QR code authentication instead.",
      );
    }

    try {
      setIsAuthenticating(true);

      if (DEBUG_AUTH) {
        console.log(`[Auth] Starting auth flow with provider: ${providerId}`);
      }

      // 1) Get the client ID for this device
      const clientId: string =
        (await SecureStore.getItemAsync(CLIENT_ID_KEY)) || generateClientId();

      // 2) Register a session with the server
      if (DEBUG_AUTH) {
        console.log(
          `[Auth] Registering auth session with client ID: ${clientId}`,
        );
      }

      const sessionResp = await fetch(`${server}/api/auth/register-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });

      if (!sessionResp.ok) {
        throw new Error(
          `Failed to register auth session: ${sessionResp.status}`,
        );
      }

      const { sessionId: authSessionId, expiresAt } =
        (await sessionResp.json()) as SessionResponse;

      if (DEBUG_AUTH) {
        console.log(`[Auth] Registered session ID: ${authSessionId}`);
        console.log(
          `[Auth] Session expires at: ${new Date(expiresAt).toLocaleString()}`,
        );
      }

      // 3) Open browser to auth URL with session ID
      const authUrl = `${server}/native-signin/${providerId}?sessionId=${authSessionId}`;

      if (DEBUG_AUTH) {
        console.log(`[Auth] Opening browser with URL: ${authUrl}`);
      }

      // Dynamically import WebBrowser only on non-tvOS platforms
      const { openAuthSessionAsync } = await import("expo-web-browser");

      // Open the browser without expecting a return via URL scheme
      await openAuthSessionAsync(authUrl, null, {
        showInRecents: true,
        // Any additional options that might help with TV platform compatibility
      });

      if (DEBUG_AUTH) {
        console.log(
          `[Auth] Browser opened, beginning polling for auth completion`,
        );
      }

      // 4) Begin polling for authentication completion
      let authCompleted = false;

      authPollInterval.current = setInterval(async () => {
        if (authCompleted) return;

        try {
          if (DEBUG_AUTH) {
            console.log(`[Auth] Polling for token status: ${authSessionId}`);
          }

          const checkResp = await fetch(
            `${server}/api/auth/check-token?sessionId=${authSessionId}`,
          );

          if (!checkResp.ok) {
            if (DEBUG_AUTH) {
              console.error(`[Auth] Token check failed: ${checkResp.status}`);
            }

            // If the error is authentication-related (401/403), try to refresh the token
            if (checkResp.status === 401 || checkResp.status === 403) {
              if (DEBUG_AUTH) {
                console.log(
                  "[Auth] Auth error during token check, attempting token refresh",
                );
              }

              const refreshSuccessful = await refreshToken();
              if (!refreshSuccessful) {
                if (DEBUG_AUTH) {
                  console.error(
                    "[Auth] Token refresh failed during authentication polling",
                  );
                }
              }
            }

            return; // Continue polling regardless of refresh outcome
          }

          const { status, tokens } =
            (await checkResp.json()) as TokenCheckResponse;

          if (DEBUG_AUTH) {
            console.log(`[Auth] Token status: ${status}`);
          }

          if (status === "expired") {
            authCompleted = true;
            stopAuthPolling();
            setIsAuthenticating(false);
            throw new Error("Authentication session expired");
          }

          if (status === "complete" && tokens) {
            // Immediately stop polling before anything else
            if (authPollInterval.current) {
              clearInterval(authPollInterval.current);
              authPollInterval.current = null;
            }

            if (authTimeoutTimer.current) {
              clearTimeout(authTimeoutTimer.current);
              authTimeoutTimer.current = null;
            }

            authCompleted = true;

            // Complete the auth flow with the received tokens
            const { user: u, mobileSessionToken } = tokens;

            if (DEBUG_AUTH) {
              console.log(
                `[Auth] Authentication completed for user: ${u?.name || "unknown"}`,
              );
              console.log(
                `[Auth] Using auth session ID for API requests: ${authSessionId}`,
              );
            }

            // Important: Use the original auth session ID, not the user ID
            setUser(u);
            setMobileToken(mobileSessionToken);
            setSessionId(authSessionId); // Use the actual session ID, not user ID
            await persist(server, u, mobileSessionToken, authSessionId);
            setIsAuthenticating(false);

            // Navigate to the appropriate platform view after authentication
            if (DEBUG_AUTH) {
              console.log(
                `[Auth] Navigating to ${Platform.isTV ? "TV" : "Mobile"} view after authentication`,
              );
            }

            // Use router.replace to force navigation to the platform-specific route
            // router.replace((Platform.isTV ? '/(tv)/' : '/(mobile)/') as any);
          }
        } catch (error: unknown) {
          if (DEBUG_AUTH) {
            console.error(`[Auth] Error during token check:`, error);
          }
          // Don't stop polling on transient errors
        }
      }, AUTH_POLL_INTERVAL);

      // Set a timeout to stop polling after a reasonable time
      authTimeoutTimer.current = setTimeout(() => {
        if (!authCompleted) {
          if (DEBUG_AUTH) {
            console.log(
              `[Auth] Authentication timed out after ${AUTH_TIMEOUT / 1000}s`,
            );
          }
          stopAuthPolling();
          setIsAuthenticating(false);
        }
      }, AUTH_TIMEOUT);
    } catch (error: unknown) {
      console.error("[Auth] Authentication error:", error);
      stopAuthPolling();
      setIsAuthenticating(false);
      throw error;
    }
  }

  /** QR Code authentication flow for TV */
  async function signInWithQRCode(): Promise<QRSessionResponse> {
    if (!server) throw new Error("Must call setServer first");

    try {
      // Stop any existing polling before starting a new QR session
      if (DEBUG_AUTH) {
        console.log(
          "[Auth] Stopping any existing polling before starting new QR session",
        );
      }
      stopAuthPolling();

      if (DEBUG_AUTH) {
        console.log("[Auth] Starting QR code authentication flow");
      }

      // 1) Get the client ID for this device
      let clientId: string | null =
        await SecureStore.getItemAsync(CLIENT_ID_KEY);
      if (!clientId) {
        clientId = generateClientId();
        await SecureStore.setItemAsync(CLIENT_ID_KEY, clientId);
        if (DEBUG_AUTH) {
          console.log(
            `[Auth] Generated new client ID for QR session: ${clientId}`,
          );
        }
      }

      // 2) Register a QR session with the server
      if (DEBUG_AUTH) {
        console.log(
          `[Auth] Registering QR auth session with client ID: ${clientId}`,
        );
      }

      // Get device information
      const deviceInfo = getDeviceInfo();
      const deviceType = getDeviceType();

      const requestData = {
        clientId,
        deviceType,
        host: server.replace("https://", "").replace("http://", ""),
        deviceInfo,
      } as QRSessionRequest;

      if (DEBUG_AUTH) {
        console.log(
          "[Auth] QR session request data:",
          JSON.stringify(requestData, null, 2),
        );
      }

      const qrSessionResp = await fetch(
        `${server}${API_ENDPOINTS.AUTH.REGISTER_QR_SESSION}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestData),
        },
      );

      if (!qrSessionResp.ok) {
        let errorMessage = `Failed to register QR auth session: ${qrSessionResp.status}`;
        try {
          const errorData = await qrSessionResp.text();
          if (DEBUG_AUTH) {
            console.error(
              "[Auth] QR session registration error response:",
              errorData,
            );
          }
          errorMessage += ` - ${errorData}`;
        } catch (e) {
          // Error response may not contain readable text
          if (DEBUG_AUTH) {
            console.error("[Auth] Could not read error response body:", e);
          }
        }
        throw new Error(errorMessage);
      }

      const qrSessionData = (await qrSessionResp.json()) as QRSessionResponse;

      if (DEBUG_AUTH) {
        console.log(
          `[Auth] Registered QR session ID: ${qrSessionData.qrSessionId}`,
        );
        console.log(
          `[Auth] QR session expires at: ${new Date(qrSessionData.expiresAt).toLocaleString()}`,
        );
      }

      return qrSessionData;
    } catch (error: unknown) {
      console.error("[Auth] QR session registration error:", error);
      throw error;
    }
  }

  /** Poll for QR authentication completion */
  async function pollQRAuthentication(qrSessionId: string): Promise<void> {
    if (!server) throw new Error("Must call setServer first");

    try {
      // Stop any existing polling before starting new polling
      if (DEBUG_AUTH) {
        console.log(
          "[Auth] Stopping any existing polling before starting new QR polling",
        );
      }
      stopAuthPolling();

      setIsAuthenticating(true);

      if (DEBUG_AUTH) {
        console.log(
          `[Auth] Starting QR authentication polling for session: ${qrSessionId}`,
        );
      }

      // Begin polling for authentication completion
      let authCompleted = false;

      authPollInterval.current = setInterval(async () => {
        if (authCompleted) return;

        try {
          if (DEBUG_AUTH) {
            console.log(`[Auth] Polling for QR token status: ${qrSessionId}`);
          }

          const checkResp = await fetch(
            `${server}${API_ENDPOINTS.AUTH.CHECK_QR_TOKEN}?qrSessionId=${qrSessionId}`,
          );

          if (!checkResp.ok) {
            if (DEBUG_AUTH) {
              console.error(
                `[Auth] QR token check failed: ${checkResp.status}`,
              );
            }
            return; // Continue polling
          }

          const { status, tokens } =
            (await checkResp.json()) as QRTokenCheckResponse;

          if (DEBUG_AUTH) {
            console.log(`[Auth] QR token status: ${status}`);
          }

          if (status === "expired") {
            authCompleted = true;
            stopAuthPolling();
            setIsAuthenticating(false);
            throw new Error("QR authentication session expired");
          }

          if (status === "complete" && tokens) {
            // Immediately stop polling before anything else
            if (authPollInterval.current) {
              clearInterval(authPollInterval.current);
              authPollInterval.current = null;
            }

            if (authTimeoutTimer.current) {
              clearTimeout(authTimeoutTimer.current);
              authTimeoutTimer.current = null;
            }

            authCompleted = true;

            // Complete the auth flow with the received tokens
            const {
              user: u,
              mobileSessionToken,
              sessionId: authSessionId,
            } = tokens;

            if (DEBUG_AUTH) {
              console.log(
                `[Auth] QR authentication completed for user: ${u?.name || "unknown"}`,
              );
              console.log(
                `[Auth] Using session ID for API requests: ${authSessionId}`,
              );
            }

            // Store the authentication data
            setUser(u);
            setMobileToken(mobileSessionToken);
            setSessionId(authSessionId);
            await persist(server, u, mobileSessionToken, authSessionId);
            setIsAuthenticating(false);

            if (DEBUG_AUTH) {
              console.log(
                `[Auth] QR authentication complete, navigating to ${Platform.isTV ? "TV" : "Mobile"} view`,
              );
            }
          }
        } catch (error: unknown) {
          if (DEBUG_AUTH) {
            console.error(`[Auth] Error during QR token check:`, error);
          }
          // Don't stop polling on transient errors
        }
      }, AUTH_POLL_INTERVAL);

      // Set a timeout to stop polling after a reasonable time
      authTimeoutTimer.current = setTimeout(() => {
        if (!authCompleted) {
          if (DEBUG_AUTH) {
            console.log(
              `[Auth] QR authentication timed out after ${AUTH_TIMEOUT / 1000}s`,
            );
          }
          stopAuthPolling();
          setIsAuthenticating(false);
        }
      }, AUTH_TIMEOUT);
    } catch (error: unknown) {
      console.error("[Auth] QR authentication polling error:", error);
      stopAuthPolling();
      setIsAuthenticating(false);
      throw error;
    }
  }

  /** Cancel QR authentication and stop polling */
  const cancelQRAuthentication = () => {
    if (DEBUG_AUTH) {
      console.log("[Auth] Cancelling QR authentication and stopping polling");
    }
    stopAuthPolling();
    setIsAuthenticating(false);
  };

  /**
   * Attempt to refresh the auth token using the current session ID
   * Returns true if token refresh was successful, false otherwise
   */
  const refreshToken = async (): Promise<boolean> => {
    if (!server || !sessionId) return false;

    if (DEBUG_AUTH) {
      console.log("[Auth] Attempting to refresh authentication token");
    }

    // Track refresh attempts to prevent infinite loops
    let attempts = 0;

    while (attempts < TOKEN_REFRESH_ATTEMPTS) {
      attempts++;

      try {
        const clientId =
          (await SecureStore.getItemAsync(CLIENT_ID_KEY)) || generateClientId();

        if (DEBUG_AUTH) {
          console.log(
            `[Auth] Token refresh attempt ${attempts}/${TOKEN_REFRESH_ATTEMPTS}`,
          );
        }

        const response = await fetch(`${server}/api/auth/refresh-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-session-id": sessionId,
          },
          body: JSON.stringify({
            clientId,
            sessionId,
          }),
        });

        if (!response.ok) {
          if (DEBUG_AUTH) {
            console.error(
              `[Auth] Token refresh failed with status: ${response.status}`,
            );
          }

          // If we get a definitive "no" (401/403), stop trying
          if (response.status === 401 || response.status === 403) {
            if (DEBUG_AUTH) {
              console.error(
                "[Auth] Server rejected refresh attempt with auth error - logging out",
              );
            }
            await signOut();
            return false;
          }

          // For other errors, wait a bit and retry if we haven't hit the limit
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        const data = (await response.json()) as TokenRefreshResponse;

        if (!data.success || !data.mobileSessionToken) {
          if (DEBUG_AUTH) {
            console.error(
              "[Auth] Token refresh response indicated failure - logging out:",
              data.error || "No error provided",
            );
          }
          await signOut();
          return false;
        }

        // Success! Update the token
        if (DEBUG_AUTH) {
          console.log("[Auth] Token refresh successful");
        }

        setMobileToken(data.mobileSessionToken);

        // If we got updated user data, update that too
        if (data.user) {
          setUser(data.user);
        }

        // Persist the updated auth data
        await persist(
          server,
          data.user || user,
          data.mobileSessionToken,
          sessionId,
        );

        // Reconfigure API client with new token
        enhancedApiClient.setAuthToken(data.mobileSessionToken);

        return true;
      } catch (error: unknown) {
        if (DEBUG_AUTH) {
          console.error("[Auth] Error during token refresh:", error);
        }

        // For network errors, wait a bit and retry if we haven't hit the limit
        if (attempts < TOKEN_REFRESH_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        return false;
      }
    }

    // If we get here, we've exhausted our attempts
    if (DEBUG_AUTH) {
      console.error(
        `[Auth] Token refresh failed after ${TOKEN_REFRESH_ATTEMPTS} attempts - logging out`,
      );
    }

    // Token refresh failed completely, log the user out
    await signOut();
    return false;
  };

  /** 8️⃣ Clear local auth data */
  const signOut = async () => {
    stopStatusChecking();
    stopAuthPolling();
    stopServerRecoveryChecking();
    setUser(null);
    setMobileToken(null);
    setSessionId(null);
    setIsAuthenticating(false);
    // Clear server status when signing out
    setIsServerDown(false);
    setServerStatusMessage(null);
    await persist(server, null, null, null);

    // Clear all cached data when signing out
    cacheStore.clear();

    // Clear any active backdrops when signing out
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
