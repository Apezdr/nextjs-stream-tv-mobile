// app/_layout.tsx
import "expo-dev-client";
import { Stack } from "expo-router";
import { Platform } from "react-native";

// Root layout with providers
export default function RootLayout() {
  const isTV = Platform.isTV;
  return (
    <Stack
      screenOptions={{
        headerShown: isTV ? false : true,
        animation: isTV ? "fade" : "default",
        contentStyle: { backgroundColor: "#000" }, // Ensure full screen on TV
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
