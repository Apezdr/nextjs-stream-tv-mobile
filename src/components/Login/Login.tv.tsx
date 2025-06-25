// src/components/login.tsx
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Alert,
  ActivityIndicator,
  StyleSheet,
  TVFocusGuideView,
  ScrollView,
  useTVEventHandler,
  TVEventControl,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import FocusableButton from "@/src/components/basic/TV/Parts/Button";
import FocusableTextInput from "@/src/components/basic/TV/Parts/Input";
import SignOutButton from "@/src/components/Login/Buttons/SignOutButton";
import { Colors } from "@/src/constants/Colors";
import { useAuth } from "@/src/providers/AuthProvider";

interface Provider {
  id: string;
  name: string;
}

const RECENT_HOSTS_KEY = "recently_used_hosts";
const MAX_RECENT_HOSTS = 5;

export default function LoginTV() {
  const { ready, server, setServer, signInWithProvider, user } = useAuth();

  const [host, setHost] = useState("");
  const [stage, setStage] = useState<"enter" | "choose" | "qr">("enter");
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [recentlyUsedHosts, setRecentlyUsedHosts] = useState<string[]>([]);

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

  // ── 1) still loading your rehydration?
  if (!ready) {
    return <ActivityIndicator style={styles.centered} />;
  }

  // ── 2) already signed in?
  if (user) {
    return (
      <TVFocusGuideView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.label}>Signed in as {user.name}</Text>
          {user.approved && <Text style={styles.approvedText}>✓ Approved</Text>}
          {user.admin && <Text style={styles.adminText}>Admin</Text>}

          <FocusableButton
            title="Go to TV Home"
            onPress={() => router.replace("/(tv)/(protected)")}
            style={[styles.button, styles.signedInButton]}
            textStyle={styles.buttonText}
            focusedStyle={styles.buttonFocused}
          />

          <SignOutButton
            title="Sign Out"
            style={styles.signOutButton}
            onSignOutComplete={() => {
              // Reset state after signing out
              setHost("");
              setStage("enter");
            }}
          />
        </View>
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

        setStage("choose");
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
          <View style={styles.form}>
            <Text style={styles.label}>Enter Site Host:</Text>
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
              style={styles.button}
              textStyle={styles.buttonText}
              focusedStyle={styles.buttonFocused}
            />
          </View>
        </TVFocusGuideView>
      );
    }

    // Layout with recent hosts - preserve original form sizing
    return (
      <TVFocusGuideView style={styles.container}>
        <View style={styles.form}>
          <Text style={styles.label}>Enter Site Host:</Text>
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
            style={styles.button}
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
        {providers.map((p) => (
          <FocusableButton
            key={p.id}
            title={`Sign in with ${p.name}`}
            onPress={() =>
              signInWithProvider(p.id).catch((err) =>
                Alert.alert("Login failed", err.message),
              )
            }
            style={styles.button}
            textStyle={styles.buttonText}
            focusedStyle={styles.buttonFocused}
          />
        ))}
        <FocusableButton
          title="Use QR Code"
          onPress={() => setStage("qr")}
          style={styles.button}
          textStyle={styles.buttonText}
          focusedStyle={styles.buttonFocused}
        />
        <FocusableButton
          title="Go back to set new site name"
          onPress={() => {
            setHost("");
            setStage("enter");
          }}
          style={styles.goBackbutton}
          textStyle={styles.buttonText}
          focusedStyle={styles.goBackbuttonFocused}
        />
      </TVFocusGuideView>
    );
  }

  // ── 5) QR pairing screen
  if (stage === "qr") {
    const pairing = {
      device: "tvos",
      host,
      code: Math.random().toString(36).substring(2, 10),
    };
    return (
      <TVFocusGuideView style={styles.container}>
        <Text style={styles.instructions}>Scan to login</Text>
        <QRCode value={JSON.stringify(pairing)} size={200} />
        <FocusableButton
          title="Back"
          onPress={() => setStage("choose")}
          style={styles.button}
          textStyle={styles.buttonText}
          focusedStyle={styles.buttonFocused}
        />
      </TVFocusGuideView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  // Original styles - completely unchanged
  adminText: { color: Colors.dark.link, fontSize: 18, marginBottom: 20 },
  approvedText: { color: Colors.dark.text, fontSize: 18, marginBottom: 10 },
  button: { height: 50, marginVertical: 12, width: "80%" },
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
  form: {
    alignItems: "center",
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: 10,
    padding: 20,
    width: "80%",
  },
  goBackbutton: {
    backgroundColor: Colors.dark.inputBackground,
    height: 50,
    marginVertical: 12,
    width: "80%",
  },
  goBackbuttonFocused: {
    backgroundColor: Colors.dark.icon,
    transform: [{ scale: 1.05 }],
  },
  input: {
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: 8,
    color: Colors.dark.inputText,
    fontSize: 18,
    height: 50,
    marginBottom: 20,
    paddingHorizontal: 15,
    width: "100%",
  },
  inputFocused: {
    borderColor: Colors.dark.link,
    borderWidth: 2,
    transform: [{ scale: 1.05 }],
  },
  instructions: {
    color: Colors.dark.inputText,
    fontSize: 20,
    marginBottom: 20,
  },
  label: {
    color: Colors.dark.inputText,
    fontSize: 24,
    marginBottom: 20,
    textAlign: "center",
  },
  recentHostButton: {
    alignItems: "center",
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: 6,
    height: 40,
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
    marginBottom: 10,
    width: "100%",
  },
  recentLabel: {
    color: Colors.dark.placeholderText,
    fontSize: 18,
    marginBottom: 15,
    textAlign: "center",
  },
  recentScrollView: {
    maxHeight: 200,
    width: "100%",
  },
  recentSection: {
    alignItems: "center",
    marginTop: 30,
    width: "80%",
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
});
