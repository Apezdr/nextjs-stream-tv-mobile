// app/(mobile)/(protected)/_layout.tsx
import { Stack } from "expo-router";

export default function ProtectedLayout() {
  console.log("ProtectedLayout rendered");

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      {/* Main tab navigator */}
      <Stack.Screen name="(tabs)" />

      {/* Nested routes outside of tabs */}
      <Stack.Screen name="media-info" />
      <Stack.Screen name="episode-info" />
      <Stack.Screen name="watch" />
    </Stack>
  );
}
