import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

import type {
  LoginState,
  LoginActions,
  LoginHandlers,
  Provider,
} from "../types";

import type { DeviceCodeResponse } from "@/src/data/types/auth.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { useAuth } from "@/src/providers/AuthProvider";
import { getDeviceType } from "@/src/utils/deviceInfo";

const RECENT_HOSTS_KEY = "recently_used_hosts";
const MAX_RECENT_HOSTS = 5;
const PROVIDER_FETCH_TIMEOUT_MS = 10000;
const STATUS_FETCH_TIMEOUT_MS = 10000;

export function useLoginLogic(
  initialStage: "enter" | "choose" | "qr" = "enter",
) {
  const isTVPlatform = getDeviceType() === "tv";
  const { show: showBackdrop, hide: hideBackdrop } = useBackdropManager();

  const {
    ready,
    server,
    setServer,
    signInWithProvider,
    signInWithQRCode,
    pollQRAuthentication,
    cancelQRAuthentication,
    user,
    sessionExpired,
  } = useAuth();

  // State
  const [host, setHost] = useState("");
  const [stage, setStage] = useState<"enter" | "choose" | "qr">(initialStage);
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [recentlyUsedHosts, setRecentlyUsedHosts] = useState<string[]>([]);
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrPolling, setQrPolling] = useState(false);
  const [shouldPlayLogo, setShouldPlayLogo] = useState(false);
  const [loadingProviderId, setLoadingProviderId] = useState<string | null>(
    null,
  );
  const [isQRExpired, setIsQRExpired] = useState(false);
  const [qrTerminalError, setQrTerminalError] = useState<
    "expired" | "access_denied" | "server_down" | null
  >(null);
  const [qrError, setQrError] = useState<string | null>(null);
  // Bumped to force the device-flow effect to re-initialize after a failure,
  // even though deviceCode is already null (a plain state reset wouldn't re-run it).
  const [qrRetryNonce, setQrRetryNonce] = useState(0);
  const qrExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against firing two device-code requests if the effect re-runs while
  // a request is already in flight.
  const deviceFlowInFlightRef = useRef(false);

  // ── Load recently used hosts from storage
  const loadRecentlyUsedHosts = useCallback(async () => {
    try {
      const stored = await SecureStore.getItemAsync(RECENT_HOSTS_KEY);
      if (stored) {
        const hosts = JSON.parse(stored);
        setRecentlyUsedHosts(hosts);
      }
    } catch (error) {
      console.log("Failed to load recently used hosts:", error);
    }
  }, []);

  // ── Save recently used hosts to storage
  const saveRecentlyUsedHosts = useCallback(async (hosts: string[]) => {
    try {
      await SecureStore.setItemAsync(RECENT_HOSTS_KEY, JSON.stringify(hosts));
      setRecentlyUsedHosts(hosts);
    } catch (error) {
      console.log("Failed to save recently used hosts:", error);
    }
  }, []);

  // ── Add host to recently used list
  const addToRecentlyUsed = useCallback(
    async (newHost: string) => {
      const updated = [
        newHost,
        ...recentlyUsedHosts.filter((h) => h !== newHost),
      ].slice(0, MAX_RECENT_HOSTS);
      await saveRecentlyUsedHosts(updated);
    },
    [recentlyUsedHosts, saveRecentlyUsedHosts],
  );

  // ── Remove host from recently used list
  const removeFromRecentlyUsed = useCallback(
    async (hostToRemove: string) => {
      const updated = recentlyUsedHosts.filter((h) => h !== hostToRemove);
      await saveRecentlyUsedHosts(updated);
    },
    [recentlyUsedHosts, saveRecentlyUsedHosts],
  );

  // ── Select a recently used host
  const selectRecentHost = useCallback((selectedHost: string) => {
    setHost(selectedHost);
  }, []);

  const loadProviders = useCallback(async () => {
    if (!server) return;

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      abortController.abort();
    }, PROVIDER_FETCH_TIMEOUT_MS);

    setProvidersLoading(true);
    setProvidersError(null);

    try {
      const response = await fetch(`${server}/api/auth/providers`, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Provider request failed (${response.status})`);
      }

      const data = (await response.json()) as
        { providers?: Provider[] } | Provider[];

      const providerList = Array.isArray(data)
        ? data
        : Array.isArray(data.providers)
          ? data.providers
          : [];

      setProviders(providerList);

      if (providerList.length === 0) {
        setProvidersError(
          "No sign-in providers are configured on this server.",
        );
      }
    } catch (error) {
      setProviders([]);

      if (error instanceof Error && error.name === "AbortError") {
        setProvidersError("Loading sign-in options timed out. Please retry.");
        return;
      }

      setProvidersError("Unable to load sign-in options. Please retry.");
      console.error("Failed to load auth providers:", error);
    } finally {
      clearTimeout(timeoutHandle);
      setProvidersLoading(false);
    }
  }, [server]);

  // ── Try to connect to server
  const tryConnect = useCallback(async (): Promise<boolean> => {
    const trimmedHost = host.trim();
    if (!trimmedHost) {
      Alert.alert("Validation Error", "Please enter a site name");
      return false;
    }

    setLoading(true);

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(
      () => abortController.abort(),
      STATUS_FETCH_TIMEOUT_MS,
    );

    try {
      // 1) Reach the server. fetch only rejects on network-level failures
      //    (bad host, DNS, TLS, offline, or our abort timeout).
      let response: Response;
      try {
        response = await fetch(`https://${trimmedHost}/api/status`, {
          signal: abortController.signal,
        });
      } catch (networkError) {
        if (
          networkError instanceof Error &&
          networkError.name === "AbortError"
        ) {
          throw new Error(
            `Couldn't reach ${trimmedHost} — the connection timed out. Check the site name and that the server is online.`,
          );
        }
        throw new Error(
          `Couldn't reach ${trimmedHost}. Double-check the site name and that the server is online.`,
        );
      }

      // 2) Server answered, but with an error status.
      if (!response.ok) {
        throw new Error(
          `${trimmedHost} responded with an error (HTTP ${response.status}). It may not be the streaming server, or it may be down.`,
        );
      }

      // 3) Server answered OK — make sure it's actually our status payload.
      const rawBody = await response.text();
      let statusOk = false;
      try {
        statusOk = Boolean((JSON.parse(rawBody) as { ok?: boolean }).ok);
      } catch {
        throw new Error(
          `${trimmedHost} responded, but not in the expected format. Make sure the site name points to your streaming server.`,
        );
      }

      if (!statusOk) {
        throw new Error(
          `Connected to ${trimmedHost}, but it reported it isn't ready yet. Try again in a moment.`,
        );
      }

      await setServer(`https://${trimmedHost}`);

      // Add to recently used hosts on successful validation
      await addToRecentlyUsed(trimmedHost);

      // Show the backdrop with poster collage once host is validated
      showBackdrop(`https://${trimmedHost}/api/public/poster-collage`, {
        fade: true,
        duration: isTVPlatform ? 800 : 500, // Slower fade on TV for better experience
      });

      setProviders([]);
      setProvidersError(null);

      // For all TV devices, skip provider selection and go directly to QR code
      if (isTVPlatform) {
        setStage("qr");
      } else {
        setStage("choose");
      }
      return true;
    } catch (e: unknown) {
      const errorMessage =
        e instanceof Error ? e.message : "Connection failed. Please try again.";
      Alert.alert("Couldn't connect", errorMessage);
      return false;
    } finally {
      clearTimeout(timeoutHandle);
      setLoading(false);
    }
  }, [host, setServer, addToRecentlyUsed, showBackdrop, isTVPlatform]);

  // ── Go back to enter stage
  const goBackToEnter = useCallback(() => {
    hideBackdrop({ fade: true, duration: 300 });
    setHost("");
    setStage("enter");
  }, [hideBackdrop]);

  // ── Go back to choose stage
  const goBackToChoose = useCallback(() => {
    setStage("choose");
  }, []);

  // ── Go to QR stage
  const goToQRStage = useCallback(() => {
    setStage("qr");
  }, []);

  // ── Cancel QR authentication
  const cancelQR = useCallback(() => {
    if (qrExpiryTimerRef.current) {
      clearTimeout(qrExpiryTimerRef.current);
      qrExpiryTimerRef.current = null;
    }
    setIsQRExpired(false);
    setQrTerminalError(null);
    setQrError(null);
    cancelQRAuthentication();
    setDeviceCode(null);
    setUserCode(null);
    setQrCode(null);
    setQrPolling(false);
  }, [cancelQRAuthentication]);

  // ── Refresh QR code — resets all device-code state so the effect triggers a
  // fresh signInWithQRCode call and starts a new expiry countdown.
  const refreshQRCode = useCallback(() => {
    if (qrExpiryTimerRef.current) {
      clearTimeout(qrExpiryTimerRef.current);
      qrExpiryTimerRef.current = null;
    }
    setIsQRExpired(false);
    setQrTerminalError(null);
    setQrError(null);
    setDeviceCode(null);
    setUserCode(null);
    setQrCode(null);
    setQrPolling(false);
    setQrRetryNonce((n) => n + 1);
  }, []);

  // ── Retry device-code generation after a failure. Resets the device-code
  // state and bumps the nonce so the init effect re-runs even though
  // deviceCode is already null.
  const retryQR = useCallback(() => {
    if (qrExpiryTimerRef.current) {
      clearTimeout(qrExpiryTimerRef.current);
      qrExpiryTimerRef.current = null;
    }
    setIsQRExpired(false);
    setQrTerminalError(null);
    setQrError(null);
    setDeviceCode(null);
    setUserCode(null);
    setQrCode(null);
    setQrPolling(false);
    setQrRetryNonce((n) => n + 1);
  }, []);

  // ── Enhanced provider sign-in with loading state (replacing original)
  const enhancedSignInWithProvider = useCallback(
    async (providerId: string) => {
      try {
        // Set loading state for this provider
        setLoadingProviderId(providerId);

        // Start the sign-in process
        await signInWithProvider(providerId);

        // Auto-clear loading state after 15 seconds if still loading
        // This handles cases where the auth process takes longer or fails silently
        setTimeout(() => {
          setLoadingProviderId((current) =>
            current === providerId ? null : current,
          );
        }, 15000);
      } catch (error) {
        // Clear loading state immediately on error
        setLoadingProviderId(null);
        throw error; // Re-throw so calling component can handle it
      }
    },
    [signInWithProvider],
  );

  // ── Load recent hosts on mount
  useEffect(() => {
    loadRecentlyUsedHosts();
  }, [loadRecentlyUsedHosts]);

  // ── Resume against an already-known server instead of asking for the host
  // again. This is what a forced sign-out (server-side session invalidation)
  // lands on: `server` survives, credentials don't. Without it the user is
  // dropped on an empty host field even though we know exactly where they
  // were signed in.
  //
  // Fires at most once per mount, so "Back" from the resumed stage still
  // reaches the host-entry screen and stays there.
  const autoResumedRef = useRef(false);
  useEffect(() => {
    if (autoResumedRef.current) return;
    // Mobile only. TV navigates by route, and app/login/index.tsx already
    // sends it straight to /login/qr when a server is known. Advancing the
    // stage here as well would be actively harmful on TV: login/enter renders
    // EnterStage regardless of `stage`, but the device-flow effect below fires
    // on stage === "qr" — so backing out of the QR screen would silently
    // request a device code behind the host-entry form.
    if (isTVPlatform) return;
    if (!ready) return;
    // Already past host entry (route-based screens pass their own stage), or
    // signed in — nothing to resume.
    if (stage !== "enter" || user) {
      autoResumedRef.current = true;
      return;
    }
    if (!server) return;

    autoResumedRef.current = true;
    // Seed the field from the stored URL rather than re-deriving it, since
    // the stored value carries the scheme.
    try {
      setHost(new URL(server).host);
    } catch {
      setHost(server.replace(/^https?:\/\//, "").replace(/\/+$/, ""));
    }
    setStage("choose");
  }, [ready, server, stage, user, isTVPlatform]);

  // ── Fetch providers whenever we hit the "choose" stage
  useEffect(() => {
    if (stage === "choose" && server) {
      void loadProviders();
    }
  }, [stage, server, loadProviders]);

  // ── Start logo animation with delay when entering choose stage
  useEffect(() => {
    if (stage === "choose") {
      setShouldPlayLogo(false);
      const timer = setTimeout(() => {
        setShouldPlayLogo(true);
      }, 400);
      return () => clearTimeout(timer);
    } else {
      setShouldPlayLogo(false);
    }
  }, [stage]);

  // ── Handle device authorization flow setup and polling
  useEffect(() => {
    const initializeDeviceFlow = async () => {
      if (!server || !signInWithQRCode) return;
      // Skip if a device-code request is already in flight (the effect can
      // re-run when auth-provider callbacks change identity mid-request).
      if (deviceFlowInFlightRef.current) return;
      deviceFlowInFlightRef.current = true;

      try {
        setLoading(true);
        setQrError(null);
        const response = (await signInWithQRCode()) as DeviceCodeResponse;
        setDeviceCode(response.device_code);
        setUserCode(response.user_code);
        // Use verification_uri_complete directly as the QR code value
        setQrCode(response.verification_uri_complete);
        setIsQRExpired(false);
        setQrTerminalError(null);

        // Start a client-side expiry countdown using the server-provided expires_in.
        // When it fires, stop polling and surface the expired state so the user
        // can refresh the code rather than getting a cryptic server error.
        if (qrExpiryTimerRef.current) clearTimeout(qrExpiryTimerRef.current);
        qrExpiryTimerRef.current = setTimeout(() => {
          setIsQRExpired(true);
          setQrTerminalError("expired");
          cancelQRAuthentication?.();
          setQrPolling(false);
        }, response.expires_in * 1000);

        setQrPolling(true);
      } catch (error) {
        console.error("Failed to initialize device auth flow:", error);
        // Surface the real reason in the failure card instead of a generic
        // popup, and keep stage on "qr" so the in-card "Try Again" works.
        const reason =
          error instanceof Error && error.message
            ? error.message
            : "We couldn't reach the sign-in service on this server.";
        setQrError(reason);
      } finally {
        deviceFlowInFlightRef.current = false;
        setLoading(false);
      }
    };

    const startPolling = async () => {
      if (!deviceCode || !pollQRAuthentication) return;

      try {
        await pollQRAuthentication(deviceCode, (errCode) => {
          // Server signalled a terminal error — cancel client timer and surface UI
          if (qrExpiryTimerRef.current) {
            clearTimeout(qrExpiryTimerRef.current);
            qrExpiryTimerRef.current = null;
          }
          setIsQRExpired(errCode === "expired");
          setQrTerminalError(errCode);
          // Don't stop polling for server_down — the timeout/expiry timers
          // handle cleanup; we just surface the error to the UI.
          if (errCode !== "server_down") {
            setQrPolling(false);
          }
        });
        setQrPolling(false);
      } catch (error) {
        console.error("QR polling error:", error);
        // Stop polling and surface the failure in the existing error card
        // (keep stage on "qr" so "Try Again" works), instead of a blocking
        // Alert + jumping to the dead "choose" stage and leaking the poll.
        cancelQRAuthentication();
        setQrTerminalError("server_down");
        setQrPolling(false);
      }
    };

    if (stage === "qr" && server && !deviceCode && !user) {
      initializeDeviceFlow();
    } else if (stage === "qr" && deviceCode && qrPolling && !user) {
      startPolling();
    }

    if (stage !== "qr") {
      setQrPolling(false);
    }

    return () => {
      // No manual cleanup needed since AuthProvider handles polling internally
    };
  }, [
    stage,
    server,
    deviceCode,
    qrPolling,
    user,
    qrRetryNonce,
    signInWithQRCode,
    pollQRAuthentication,
  ]);

  // ── Reset QR/device state when leaving QR stage
  useEffect(() => {
    if (stage !== "qr") {
      if (qrExpiryTimerRef.current) {
        clearTimeout(qrExpiryTimerRef.current);
        qrExpiryTimerRef.current = null;
      }
      setIsQRExpired(false);
      setQrTerminalError(null);
      setQrError(null);
      setDeviceCode(null);
      setUserCode(null);
      setQrCode(null);
      setQrPolling(false);
      deviceFlowInFlightRef.current = false;
    }
  }, [stage]);

  const state: LoginState = {
    host,
    stage,
    loading,
    providers,
    providersLoading,
    providersError,
    recentlyUsedHosts,
    deviceCode,
    userCode,
    qrCode,
    qrPolling,
    shouldPlayLogo,
    loadingProviderId,
    isQRExpired,
    qrTerminalError,
    qrError,
  };

  const actions: LoginActions = {
    setHost,
    setStage,
    setLoading,
    setProviders,
    setRecentlyUsedHosts,
    setDeviceCode,
    setUserCode,
    setQrCode,
    setQrPolling,
    setShouldPlayLogo,
    setLoadingProviderId,
    setIsQRExpired,
    setQrTerminalError,
    retryQR,
    refreshQRCode,
    selectRecentHost,
    removeFromRecentlyUsed,
    tryConnect,
    reloadProviders: loadProviders,
    signInWithProvider: enhancedSignInWithProvider,
  };

  const handlers: LoginHandlers = {
    loadRecentlyUsedHosts,
    saveRecentlyUsedHosts,
    addToRecentlyUsed,
  };

  return {
    // Auth state
    ready,
    user,
    server,
    signInWithProvider,
    isTVPlatform,
    sessionExpired,

    // Login state
    state,
    actions,
    handlers,

    // Navigation actions
    goBackToEnter,
    goBackToChoose,
    goToQRStage,
    cancelQR,
  };
}
