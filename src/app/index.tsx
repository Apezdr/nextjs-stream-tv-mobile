import { Redirect } from "expo-router";
import { Platform } from "react-native";

import { useAuth } from "@/src/providers/AuthProvider";

export default function RootIndex() {
  // Check if running on TV platform
  const isTV = Platform.isTV;
  const { user } = useAuth();

  console.log("Root index - Platform.isTV:", isTV);
  console.log("Root index - EXPO_TV env:", process.env.EXPO_TV);
  console.log(
    "JSON.stringify(process.env, null, 2):",
    JSON.stringify(process.env, null, 2),
  );

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
