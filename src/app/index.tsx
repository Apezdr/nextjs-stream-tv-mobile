import { Redirect } from "expo-router";

import { getDeviceType } from "../utils/deviceInfo";

import { useAuth } from "@/src/providers/AuthProvider";

export default function RootIndex() {
  // Check if running on TV platform
  const isTV = getDeviceType() === "tv";
  const { user, apiReady, ready } = useAuth();

  if (!user && !apiReady && ready) {
    return <Redirect href="/login" withAnchor />;
  }

  // Redirect to appropriate platform
  if (isTV && user && user.approved && apiReady && ready) {
    return <Redirect href="/(tv)/(protected)" withAnchor />;
  } else if (!isTV && user && user.approved && apiReady && ready) {
    return <Redirect href="/(mobile)/(protected)" withAnchor />;
  } else {
    return <Redirect href="/login" withAnchor />;
  }
}
