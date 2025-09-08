// src/components/login.tsx
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import LottieView from "lottie-react-native";
import { useState, useEffect, useCallback } from "react";
import {
  Alert,
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  TVFocusGuideView,
  ScrollView,
  useTVEventHandler,
  Platform,
  TVEventControl,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import logoAnimation from "@/src/assets/lottie/logo-in.json";
// import QRIcon from "@/src/assets/provider-icons/qr-logo.svg";
import FocusableButton from "@/src/components/basic/TV/Parts/Button";
import FocusableTextInput from "@/src/components/basic/TV/Parts/Input";
import Card from "@/src/components/common/Card";
import ProviderButton from "@/src/components/Login/Buttons/ProviderButton";
import SignOutButton from "@/src/components/Login/Buttons/SignOutButton";
import { Colors } from "@/src/constants/Colors";
import { QRSessionResponse } from "@/src/data/types/auth.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { useAuth } from "@/src/providers/AuthProvider";

interface Provider {
  id: string;
  name: string;
}

const RECENT_HOSTS_KEY = "recently_used_hosts";
const MAX_RECENT_HOSTS = 5;

// Raw SVG string for QRCode logoSVG prop
const splashSvgString = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 27 22"
  fill="currentColor"
>
  <path
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="M6.99906 0.5L6.57031 0.742752L0.570312 10.7428V11.2572L6.57031 21.2572L6.99906 21.5H18.9991L19.3526 20.6464L16.8526 18.1464L16.4991 18H9.27424L4.8409 11L9.27424 4H16.4991L16.8526 3.85355L19.3526 1.35355L18.9991 0.5H6.99906Z"
  />
  <path
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="M20.7927 4.21875L18.3657 6.64575L18.2969 7.2668L20.6605 10.9993L18.2969 14.7318L18.3657 15.3529L20.7927 17.7799L21.5751 17.6835L25.4311 11.2565V10.7421L21.5751 4.31507L20.7927 4.21875Z"
  />
</svg>`;

export default function Login() {
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

  const { show: showBackdrop, hide: hideBackdrop } = useBackdropManager();

  const [host, setHost] = useState("");
  const [stage, setStage] = useState<"enter" | "choose" | "qr">("enter");
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [recentlyUsedHosts, setRecentlyUsedHosts] = useState<string[]>([]);
  // Used for QR code authentication
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrPolling, setQrPolling] = useState(false);
  // Logo animation state
  const [shouldPlayLogo, setShouldPlayLogo] = useState(false);

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

  // ── TV remote play/pause resets us to enter
  const tvEventHandler = useCallback((event: { eventType: string }) => {
    if (event.eventType === "playPause") {
      setHost("");
      setStage("enter");
    }
  }, []);
  useTVEventHandler(tvEventHandler);

  // ── Enable the pan gesture guide once and load recent hosts
  useEffect(() => {
    TVEventControl.enableTVPanGesture();
    loadRecentlyUsedHosts();
    return () => TVEventControl.disableTVPanGesture();
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

  // ── 1) still loading your rehydration?
  if (!ready) {
    return <ActivityIndicator style={styles.centered} />;
  }

  // ── 2) already signed in?
  if (user) {
    return (
      <TVFocusGuideView style={styles.container}>
        <Card style={styles.authCard}>
          <Text style={styles.authTitle}>Welcome back!</Text>
          <Text style={styles.signedInLabel}>Signed in as {user.name}</Text>
          {user.approved && <Text style={styles.approvedText}>✓ Approved</Text>}
          {user.admin && <Text style={styles.adminText}>Admin</Text>}

          <View style={styles.signedInActions}>
            <FocusableButton
              title="Go to TV Home"
              onPress={() => {
                hideBackdrop({ fade: true, duration: 500 });
                router.replace("/(tv)/(protected)");
              }}
              style={[styles.button, styles.signedInButton]}
              textStyle={styles.buttonText}
              focusedStyle={styles.buttonFocused}
            />

            <SignOutButton
              title="Sign Out"
              style={styles.signOutButton}
              onSignOutComplete={() => {
                // Reset state after signing out
                hideBackdrop({ fade: true, duration: 300 });
                setHost("");
                setStage("enter");
              }}
            />
          </View>
        </Card>
      </TVFocusGuideView>
    );
  }

  // ── 3) ask for host
  if (stage === "enter") {
    const tryConnect = async () => {
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
        });

        // For tvOS devices, skip provider selection and go directly to QR code
        if (Platform.isTVOS) {
          setStage("qr");
        } else {
          setStage("choose");
        }
      } catch (e: unknown) {
        const errorMessage =
          e instanceof Error ? e.message : "Connection failed";
        Alert.alert("Validation Error", errorMessage);
      } finally {
        setLoading(false);
      }
    };

    // Original layout when no recent hosts
    if (recentlyUsedHosts.length === 0) {
      return (
        <TVFocusGuideView style={styles.container}>
          <Card style={styles.authCard}>
            <Text style={styles.authTitle}>Connect to Server</Text>
            <Text style={styles.authSubtitle}>
              Enter your server host to get started
            </Text>

            <View style={styles.enterForm}>
              <FocusableTextInput
                placeholder="cinema.example.com"
                value={host}
                onChangeText={setHost}
                onSubmitEditing={tryConnect}
                style={styles.input}
                focusedStyle={styles.inputFocused}
              />
              <FocusableButton
                title={loading ? "Checking…" : "Connect"}
                onPress={tryConnect}
                style={[styles.button, styles.connectButton]}
                textStyle={styles.buttonText}
                focusedStyle={styles.buttonFocused}
              />
            </View>
          </Card>
        </TVFocusGuideView>
      );
    }

    // Layout with recent hosts
    return (
      <TVFocusGuideView style={styles.container}>
        <Card style={styles.authCard}>
          <Text style={styles.authTitle}>Connect to Server</Text>
          <Text style={styles.authSubtitle}>
            Enter your server host or select from recent
          </Text>

          <View style={styles.enterForm}>
            <FocusableTextInput
              placeholder="cinema.example.com"
              value={host}
              onChangeText={setHost}
              onSubmitEditing={tryConnect}
              style={styles.input}
              focusedStyle={styles.inputFocused}
            />
            <FocusableButton
              title={loading ? "Checking…" : "Connect"}
              onPress={tryConnect}
              style={[styles.button, styles.connectButton]}
              textStyle={styles.buttonText}
              focusedStyle={styles.buttonFocused}
            />
          </View>

          <View style={styles.recentSection}>
            <Text style={styles.recentLabel}>Recently Used:</Text>
            <ScrollView
              style={styles.recentScrollView}
              showsVerticalScrollIndicator={false}
            >
              {recentlyUsedHosts.map((recentHost, index) => (
                <View
                  key={`${recentHost}-${index}`}
                  style={styles.recentHostContainer}
                >
                  <FocusableButton
                    title={recentHost}
                    onPress={() => selectRecentHost(recentHost)}
                    style={styles.recentHostButton}
                    textStyle={styles.recentHostButtonText}
                    focusedStyle={styles.recentHostButtonFocused}
                  />
                  <FocusableButton
                    title="×"
                    onPress={() => removeFromRecentlyUsed(recentHost)}
                    style={styles.removeButton}
                    textStyle={styles.removeButtonText}
                    focusedStyle={styles.removeButtonFocused}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        </Card>
      </TVFocusGuideView>
    );
  }

  // ── 4) show SSO options
  if (stage === "choose") {
    if (providers.length === 0) {
      return <ActivityIndicator style={styles.centered} />;
    }
    return (
      <TVFocusGuideView style={styles.container}>
        <Card style={styles.authCard}>
          <View style={styles.logoContainer}>
            <LottieView
              source={logoAnimation}
              autoPlay={shouldPlayLogo}
              loop={false}
              style={styles.logo}
            />
          </View>
          <Text style={styles.authTitle}>Choose Authentication Method</Text>
          <Text style={styles.authSubtitle}>
            Sign in to access the content on this server
          </Text>

          <View style={styles.providersContainer}>
            {/* <FocusableButton
              title="Use QR Code"
              onPress={() => setStage("qr")}
              leftIcon={QRIcon}
              iconSize={39}
              style={[styles.button, styles.qrButton]}
              textStyle={styles.qrButtonText}
              focusedStyle={styles.qrButtonFocused}
              hasTVPreferredFocus
            /> */}
            {providers.map((p) => (
              <ProviderButton
                key={p.id}
                providerId={p.id}
                providerName={p.name}
                onPress={() =>
                  signInWithProvider(p.id).catch((err) =>
                    Alert.alert("Login failed", err.message),
                  )
                }
                style={[styles.button, styles.providerButton]}
                textStyle={styles.providerButtonText}
                focusedStyle={styles.providerButtonFocused}
              />
            ))}
          </View>

          <FocusableButton
            title="Go back to set new site name"
            onPress={() => {
              hideBackdrop({ fade: true, duration: 300 });
              setHost("");
              setStage("enter");
            }}
            style={styles.backButton}
            textStyle={styles.backButtonText}
            focusedStyle={styles.backButtonFocused}
          />
        </Card>
      </TVFocusGuideView>
    );
  }

  // ── 5) QR pairing screen
  if (stage === "qr") {
    if (loading) {
      return (
        <TVFocusGuideView style={styles.container}>
          <Card style={styles.authCard}>
            <View style={styles.qrLoadingContainer}>
              <ActivityIndicator
                size="large"
                color={Colors.dark.brandPrimary}
              />
              <Text style={styles.authTitle}>Generating QR Code</Text>
              <Text style={styles.authSubtitle}>
                Please wait while we prepare your authentication code
              </Text>
            </View>

            <FocusableButton
              title={Platform.isTVOS ? "Go back to set new site name" : "Back"}
              onPress={() => {
                if (Platform.isTVOS) {
                  hideBackdrop({ fade: true, duration: 300 });
                  setHost("");
                  setStage("enter");
                } else {
                  setStage("choose");
                }
              }}
              style={styles.backButton}
              textStyle={styles.backButtonText}
              focusedStyle={styles.backButtonFocused}
            />
          </Card>
        </TVFocusGuideView>
      );
    }

    if (!qrCode) {
      return (
        <TVFocusGuideView style={styles.container}>
          <Card style={styles.authCard}>
            <Text style={styles.authTitle}>QR Code Failed</Text>
            <Text style={styles.authSubtitle}>
              Unable to generate QR code. Please try again.
            </Text>

            <View style={styles.qrErrorActions}>
              <FocusableButton
                title="Try Again"
                onPress={() => {
                  setQrSessionId(null);
                  setQrCode(null);
                  setQrPolling(false);
                }}
                style={[styles.button, styles.connectButton]}
                textStyle={styles.buttonText}
                focusedStyle={styles.buttonFocused}
              />

              <FocusableButton
                title={
                  Platform.isTVOS ? "Go back to set new site name" : "Back"
                }
                onPress={() => {
                  if (Platform.isTVOS) {
                    hideBackdrop({ fade: true, duration: 300 });
                    setHost("");
                    setStage("enter");
                  } else {
                    setStage("choose");
                  }
                }}
                style={styles.backButton}
                textStyle={styles.backButtonText}
                focusedStyle={styles.backButtonFocused}
              />
            </View>
          </Card>
        </TVFocusGuideView>
      );
    }

    return (
      <TVFocusGuideView style={styles.container}>
        <Card style={styles.authCard}>
          <Text style={styles.authTitle}>
            {qrPolling ? "Scan QR Code" : "Authentication Ready"}
          </Text>
          <Text style={styles.authSubtitle}>
            {qrPolling
              ? "Use your mobile device to approve TV sign-in"
              : "Scan the code below to authenticate"}
          </Text>

          <View style={styles.qrContainer}>
            <QRCode
              value={qrCode}
              size={200}
              logoSVG={splashSvgString}
              logoSize={40}
              logoBorderRadius={15}
              logoColor={"black"}
            />
            {qrPolling && (
              <Text style={styles.pollingText}>
                Waiting for authentication...
              </Text>
            )}
          </View>

          <View style={styles.qrInstructions}>
            <Text style={styles.instructionsTitle}>How to sign in:</Text>
            <Text style={styles.instructionStep}>
              1. Open your mobile camera or QR scanner
            </Text>
            <Text style={styles.instructionStep}>
              2. Scan the QR code shown above
            </Text>
            <Text style={styles.instructionStep}>
              3. Complete sign-in on your mobile device
            </Text>
            <Text style={[styles.instructionStep, styles.lastInstruction]}>
              4. You'll be signed in automatically on TV
            </Text>
          </View>

          <FocusableButton
            title={Platform.isTVOS ? "Go back to set new site name" : "Back"}
            onPress={() => {
              // Cancel QR authentication and stop polling in AuthProvider
              cancelQRAuthentication();
              // Reset local state
              setQrSessionId(null);
              setQrCode(null);
              setQrPolling(false);

              if (Platform.isTVOS) {
                hideBackdrop({ fade: true, duration: 300 });
                setHost("");
                setStage("enter");
              } else {
                setStage("choose");
              }
            }}
            style={styles.backButton}
            textStyle={styles.backButtonText}
            focusedStyle={styles.backButtonFocused}
          />
        </Card>
      </TVFocusGuideView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  // Original styles - completely unchanged
  adminText: { color: Colors.dark.link, fontSize: 18, marginBottom: 20 },
  approvedText: { color: Colors.dark.text, fontSize: 18, marginBottom: 10 },
  button: { height: 50, marginVertical: 2, width: "80%" },
  buttonFocused: {
    backgroundColor: Colors.dark.link,
    transform: [{ scale: 1.05 }],
  },
  buttonText: { color: Colors.dark.inputText, fontSize: 18 },
  centered: { alignItems: "center", flex: 1, justifyContent: "center" },
  container: {
    alignItems: "center",
    backgroundColor: Colors.dark.background,
    flex: 1,
    justifyContent: "center",
  },
  // Enhanced auth card styles
  authCard: {
    alignItems: "center",
    maxWidth: 500,
    width: "85%",
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  logo: {
    height: 64,
    width: 78,
  },
  authTitle: {
    color: Colors.dark.text,
    fontSize: 28,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  authSubtitle: {
    color: Colors.dark.placeholderText,
    fontSize: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  signedInLabel: {
    color: Colors.dark.text,
    fontSize: 20,
    marginBottom: 16,
    textAlign: "center",
  },
  signedInActions: {
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  enterForm: {
    alignItems: "center",
    gap: 16,
    width: "100%",
  },
  connectButton: {
    backgroundColor: Colors.dark.brandPrimary,
    width: "100%",
  },
  providerButton: {
    backgroundColor: Colors.dark.qrBg,
    borderColor: Colors.dark.qrBorder,
    marginTop: 2,
    opacity: 1,
    width: "100%",
  },
  providersContainer: {
    gap: 2,
    marginBottom: 15,
    width: "100%",
  },
  providerButtonText: {
    color: Colors.dark.qrText,
    fontSize: 18,
  },
  providerButtonFocused: {
    backgroundColor: Colors.dark.qrBg,
    borderColor: Colors.dark.link,
    opacity: 1,
    transform: [{ scale: 1.05 }],
  },
  // qrButton: {
  //   backgroundColor: Colors.dark.qrBg,
  //   borderColor: Colors.dark.qrBorder,
  //   marginTop: 2,
  //   opacity: 0.3,
  //   width: "100%",
  // },
  // qrButtonText: {
  //   color: Colors.dark.qrText,
  //   fontSize: 18,
  // },
  // qrButtonFocused: {
  //   backgroundColor: Colors.dark.qrBg,
  //   opacity: 1,
  //   transform: [{ scale: 1.05 }],
  // },
  backButton: {
    backgroundColor: Colors.dark.outline,
    height: 48,
    marginTop: 4,
    opacity: 0.3,
    width: "100%",
  },
  backButtonText: {
    color: Colors.dark.text,
    fontSize: 16,
  },
  backButtonFocused: {
    backgroundColor: Colors.dark.icon,
    opacity: 1,
    transform: [{ scale: 1.02 }],
  },
  // QR stage styles
  qrLoadingContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  qrErrorActions: {
    width: "100%",
    gap: 4,
    marginTop: 16,
  },
  qrContainer: {
    alignItems: "center",
    marginVertical: 2,
  },
  qrInstructions: {
    width: "100%",
    paddingHorizontal: 16,
  },
  instructionsTitle: {
    color: Colors.dark.inputText,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  instructionStep: {
    color: Colors.dark.placeholderText,
    fontSize: 14,
    marginBottom: 0,
    paddingLeft: 4,
  },
  lastInstruction: {
    marginBottom: 10,
  },
  input: {
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: 8,
    color: Colors.dark.inputText,
    fontSize: 18,
    height: 50,
    marginBottom: 0,
    paddingHorizontal: 15,
    width: "100%",
  },
  inputFocused: {
    borderColor: Colors.dark.link,
    borderWidth: 2,
    transform: [{ scale: 1.05 }],
  },
  recentHostButton: {
    alignItems: "center",
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: 6,
    height: 35,
    justifyContent: "center",
    marginRight: 10,
    width: "85%",
  },
  recentHostButtonFocused: {
    backgroundColor: Colors.dark.link,
    transform: [{ scale: 1.02 }],
  },
  recentHostButtonText: {
    color: Colors.dark.text,
    fontSize: 16,
    textAlign: "center",
  },
  recentHostContainer: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 0,
    width: "100%",
  },
  recentLabel: {
    color: Colors.dark.placeholderText,
    fontSize: 18,
    marginBottom: 2,
    textAlign: "center",
  },
  recentScrollView: {
    maxHeight: 200,
    width: "100%",
  },
  recentSection: {
    alignItems: "center",
    marginTop: 8,
    width: "100%",
  },
  removeButton: {
    backgroundColor: Colors.dark.icon,
    borderRadius: 6,
    height: 40,
    width: 40,
  },
  removeButtonFocused: {
    backgroundColor: Colors.dark.link,
    transform: [{ scale: 1.1 }],
  },
  removeButtonText: {
    color: Colors.dark.inputText,
    fontSize: 20,
    fontWeight: "bold",
  },
  signOutButton: {
    backgroundColor: Colors.dark.link,
    marginTop: 30,
    width: 250,
  },
  signedInButton: { backgroundColor: Colors.dark.link, marginBottom: 20 },
  pollingText: {
    color: Colors.dark.placeholderText,
    fontSize: 16,
    marginTop: 15,
    textAlign: "center",
  },
});
