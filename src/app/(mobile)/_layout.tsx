// app/(mobile)/_layout.tsx
import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/src/providers/AuthProvider";

export default function MobileLayout() {
  console.log("MobileLayout rendered");
  const { ready, user } = useAuth();

  if (!ready) {
    // still checking storage → keep splash visible
    return null;
  }

  if (!user) {
    // once ready, if no user, send to login
    return <Redirect href="/login" />;
  }

  // logged in → render protected routes
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="(protected)" />
    </Stack>
  );
}
