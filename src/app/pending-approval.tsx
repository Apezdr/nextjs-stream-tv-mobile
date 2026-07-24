import { Redirect } from "expo-router";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  StyleSheet,
  Text,
  View,
} from "react-native";

import FocusableButton from "@/src/components/basic/TV/Parts/Button";
import { Colors } from "@/src/constants/Colors";
import { useAuth } from "@/src/providers/AuthProvider";

// How often to re-check the session while waiting for an admin to approve.
const POLL_INTERVAL_MS = 10000;

/**
 * Shown when a user is authenticated but their account isn't approved yet.
 * Without this screen the root guards bounce unapproved users between "/" and
 * "/login" forever (index.tsx requires user.approved; the login screens
 * redirect any logged-in user back to "/"). Here we hold them and poll the
 * session so the screen advances automatically once approval lands.
 */
export default function PendingApprovalScreen() {
  const { ready, user, refreshUserStatus, isRefreshing, signOut } = useAuth();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const waiting = !!user && !user.approved;

  // Poll for the approval flip while this screen is mounted.
  useEffect(() => {
    if (!waiting) return;
    refreshUserStatus();
    const interval = setInterval(refreshUserStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [waiting, refreshUserStatus]);

  // Re-check immediately when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        next === "active" &&
        waiting
      ) {
        refreshUserStatus();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [waiting, refreshUserStatus]);

  if (!ready) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.dark.brandPrimary} />
      </View>
    );
  }

  // Not signed in → let the login flow take over.
  if (!user) {
    return <Redirect href="/login" />;
  }

  // Approved (possibly just now, via polling) → into the app.
  if (user.approved) {
    return <Redirect href="/" withAnchor />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Awaiting approval</Text>
        <Text style={styles.subtitle}>
          You&apos;re signed in
          {user.email ? ` as ${user.email}` : ""}, but your account hasn&apos;t
          been approved yet. An administrator needs to grant access. This screen
          will continue on its own once you&apos;re approved.
        </Text>

        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={Colors.dark.brandPrimary} />
          <Text style={styles.statusText}>
            {isRefreshing ? "Checking…" : "Waiting for approval…"}
          </Text>
        </View>

        <FocusableButton
          title="Check again"
          onPress={() => refreshUserStatus()}
          style={styles.primaryButton}
          textStyle={styles.primaryButtonText}
          focusedStyle={styles.primaryButtonFocused}
          hasTVPreferredFocus
        />
        <FocusableButton
          title="Sign out"
          onPress={() => signOut()}
          style={styles.secondaryButton}
          textStyle={styles.secondaryButtonText}
          focusedStyle={styles.secondaryButtonFocused}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 16,
    maxWidth: 520,
    padding: 32,
    width: "100%",
  },
  container: {
    alignItems: "center",
    backgroundColor: Colors.dark.background,
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  primaryButton: {
    backgroundColor: Colors.dark.brandPrimary,
    width: "100%",
  },
  primaryButtonFocused: {
    borderColor: Colors.dark.outlineFocused,
    borderWidth: 2,
  },
  primaryButtonText: {
    color: Colors.dark.videoControlText,
  },
  secondaryButton: {
    backgroundColor: "transparent",
    width: "100%",
  },
  secondaryButtonFocused: {
    borderColor: Colors.dark.outlineFocused,
    borderWidth: 2,
  },
  secondaryButtonText: {
    color: Colors.dark.placeholderText,
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
  },
  statusText: {
    color: Colors.dark.placeholderText,
    fontSize: 14,
  },
  subtitle: {
    color: Colors.dark.placeholderText,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 20,
    textAlign: "center",
  },
  title: {
    color: Colors.dark.text,
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
});
