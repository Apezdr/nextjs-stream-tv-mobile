import { Redirect } from "expo-router";

import { getDeviceType } from "../utils/deviceInfo";

import { useAuth } from "@/src/providers/AuthProvider";

export default function RootIndex() {
  // Check if running on TV platform
  const isTV = getDeviceType() === "tv";
  const { user, apiReady, ready } = useAuth();

  // Wait for auth to finish rehydrating before making routing decisions.
  // Without this guard, the else-fallthrough would send authenticated users
  // to /login before their saved session has been restored from storage.
  if (!ready) {
    return null;
  }

  // Authenticated + API ready → go to the appropriate protected area
  if (user && user.approved && apiReady) {
    return isTV ? (
      <Redirect href="/(tv)/(protected)" withAnchor />
    ) : (
      <Redirect href="/(mobile)/(protected)" withAnchor />
    );
  }

  // Not authenticated (or API not yet ready) → go to login
  return <Redirect href="/login" withAnchor />;
}
