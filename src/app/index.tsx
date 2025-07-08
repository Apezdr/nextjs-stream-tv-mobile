import { Redirect } from "expo-router";
import { Platform } from "react-native";

import { useAuth } from "@/src/providers/AuthProvider";

export default function RootIndex() {
  // Check if running on TV platform
  const isTV = Platform.isTV;
  const { user } = useAuth();

  if (!user) {
    return <Redirect href="/login" withAnchor />;
  }

  // Redirect to appropriate platform
  if (isTV) {
    return <Redirect href="/(tv)/(protected)" />;
  } else {
    return <Redirect href="/(mobile)/(protected)" />;
  }
}
