import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { Alert, Platform } from "react-native";

import type {
  LoginState,
  LoginActions,
  LoginHandlers,
  Provider,
} from "../types";

import { QRSessionResponse } from "@/src/data/types/auth.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { useAuth } from "@/src/providers/AuthProvider";
import { getDeviceType } from "@/src/utils/deviceInfo";

const RECENT_HOSTS_KEY = "recently_used_hosts";
const MAX_RECENT_HOSTS = 5;

export function useLoginLogic() {
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
  } = useAuth();

  // State
  const [host, setHost] = useState("");
  const [stage, setStage] = useState<"enter" | "choose" | "qr">("enter");
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [recentlyUsedHosts, setRecentlyUsedHosts] = useState<string[]>([]);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrPolling, setQrPolling] = useState(false);
  const [shouldPlayLogo, setShouldPlayLogo] = useState(false);
  const [loadingProviderId, setLoadingProviderId] = useState<string | null>(
    null,
  );

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

  // ── Try to connect to server
  const tryConnect = useCallback(async () => {
    if (!host.trim()) {
      return Alert.alert("Validation Error", "Please enter a site name");
    }
    setLoading(true);
    try {
      const { ok } = await fetch(`https://${host}/api/status`).then((r) =>
        r.json(),
      );
      console.log(ok);
      if (!ok) throw new Error("Status check failed");
      await setServer(`https://${host}`);

      // Add to recently used hosts on successful validation
      await addToRecentlyUsed(host);

      // Show the backdrop with poster collage once host is validated
      showBackdrop(`https://${host}/api/public/poster-collage`, {
        fade: true,
        duration: isTVPlatform ? 800 : 500, // Slower fade on TV for better experience
      });

      // For tvOS devices, skip provider selection and go directly to QR code
      if (Platform.isTVOS) {
        setStage("qr");
      } else {
        setStage("choose");
      }
    } catch (e: unknown) {
      let errorHeader = "Validation Error";
      let errorMessage = e instanceof Error ? e.message : "Connection failed";

      if (
        typeof errorMessage === "string" &&
        errorMessage.includes("JSON Parse error: Unexpected character: <")
      ) {
        errorHeader = "Site connection failed";
        errorMessage =
          "We're having issues communicating with that host, it may be offline you can try again later.";
      }

      Alert.alert(errorHeader, errorMessage);
    } finally {
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
    cancelQRAuthentication();
    setQrSessionId(null);
    setQrCode(null);
    setQrPolling(false);
  }, [cancelQRAuthentication]);

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

  // ── Fetch providers whenever we hit the "choose" stage
  useEffect(() => {
    if (stage === "choose" && server) {
      fetch(`${server}/api/auth/providers`)
        .then((r) => r.json())
        .then((obj) => setProviders(Object.values(obj) as Provider[]))
        .catch(() => Alert.alert("Error", "Unable to load providers"));
    }
  }, [stage, server]);

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

  // ── Handle QR code session setup and polling
  useEffect(() => {
    const initializeQRSession = async () => {
      if (!server || !signInWithQRCode) return;

      try {
        setLoading(true);
        const response = (await signInWithQRCode()) as QRSessionResponse;
        setQrSessionId(response.qrSessionId);
        // Generate QR code URL pointing to mobile web page
        const qrUrl = `${server}/qr-auth?qrSessionId=${response.qrSessionId}`;
        setQrCode(qrUrl);
        setQrPolling(true);
      } catch (error) {
        console.error("Failed to initialize QR session:", error);
        Alert.alert("Error", "Failed to generate QR code");
        setStage("choose");
      } finally {
        setLoading(false);
      }
    };

    const startPolling = async () => {
      if (!qrSessionId || !pollQRAuthentication) return;

      try {
        // The AuthProvider handles the polling internally
        // When authentication completes, the user state will be updated automatically
        await pollQRAuthentication(qrSessionId);
        setQrPolling(false);
      } catch (error) {
        console.error("QR polling error:", error);
        Alert.alert("Error", "QR authentication failed");
        setStage("choose");
        setQrPolling(false);
      }
    };

    if (stage === "qr" && server && !qrSessionId) {
      initializeQRSession();
    } else if (stage === "qr" && qrSessionId && qrPolling) {
      startPolling();
    }

    // Cleanup when leaving QR stage
    if (stage !== "qr") {
      setQrPolling(false);
    }

    return () => {
      // No manual cleanup needed since AuthProvider handles polling internally
    };
  }, [
    stage,
    server,
    qrSessionId,
    qrPolling,
    signInWithQRCode,
    pollQRAuthentication,
  ]);

  // ── Reset QR state when leaving QR stage
  useEffect(() => {
    if (stage !== "qr") {
      setQrSessionId(null);
      setQrCode(null);
      setQrPolling(false);
    }
  }, [stage]);

  const state: LoginState = {
    host,
    stage,
    loading,
    providers,
    recentlyUsedHosts,
    qrSessionId,
    qrCode,
    qrPolling,
    shouldPlayLogo,
    loadingProviderId,
  };

  const actions: LoginActions = {
    setHost,
    setStage,
    setLoading,
    setProviders,
    setRecentlyUsedHosts,
    setQrSessionId,
    setQrCode,
    setQrPolling,
    setShouldPlayLogo,
    setLoadingProviderId,
    selectRecentHost,
    removeFromRecentlyUsed,
    tryConnect,
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
