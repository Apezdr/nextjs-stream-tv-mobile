// app/_layout.tsx
import "expo-dev-client";
import "react-native-gesture-handler";
import { Stack } from "expo-router";
import {
  ThemeProvider,
  DefaultTheme,
  DarkTheme,
} from "expo-router/react-navigation";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { SafeAreaProvider } from "react-native-safe-area-context";

import GlobalBackdrop from "../components/TV/GlobalBackdrop";
import { getDeviceType } from "../utils/deviceInfo";

import { PortalProvider } from "@/src/components/common/Portal";
import { useAutoUpdates } from "@/src/hooks/useAutoUpdates";
import { AuthProvider, useAuth } from "@/src/providers/AuthProvider";
import { QueryProvider } from "@/src/providers/QueryProvider";

// Prevent the splash screen from auto-hiding before asset loading is complete
SplashScreen.preventAutoHideAsync();

// Fade the splash out smoothly so there's no abrupt cut to white
SplashScreen.setOptions({
  duration: 800,
  fade: true,
});

// Inner component that uses the auth context
function StackNavigator({ isTV = getDeviceType() === "tv" }) {
  const { user, ready, apiReady } = useAuth();

  // Determine if user is logged in based on auth context
  const loggedIn = !!user;

  console.log(isTV ? "Running on TV" : "Running on Mobile");
  console.log("User logged in:", loggedIn);

  // Hide splash screen once both auth AND API are ready so index.tsx can
  // immediately redirect to the correct screen with no white flash.
  // Safety timeout: if apiReady hasn't fired within 15s of auth being ready
  // (e.g. server offline / slow network), hide anyway so the app doesn't hang.
  useEffect(() => {
    if (ready && apiReady) {
      SplashScreen.hideAsync();
      return;
    }
    if (ready) {
      const timer = setTimeout(() => SplashScreen.hideAsync(), 15000);
      return () => clearTimeout(timer);
    }
  }, [ready, apiReady]);

  // Always render the Stack to prevent white flash
  // The splash screen will remain visible until auth is ready
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "ios_from_right",
        contentStyle: { backgroundColor: "transparent" },
      }}
    >
      {/* <Stack.Protected guard={apiReady && ready && loggedIn}>
        <Stack.Screen name="index" />
        {isTV ? (
          <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
            <Stack.Screen
              name="(tv)"
              options={{ headerShown: false, animation: "ios_from_right" }}
            />
          </SafeAreaView>
        ) : (
          <Stack.Screen
            name="(mobile)"
            options={{ headerShown: false, animation: "ios_from_right" }}
          />
        )}
      </Stack.Protected> */}
      <Stack.Screen name="login" />
      <Stack.Screen name="pending-approval" />
    </Stack>
  );
}

// Root layout with providers
export default function RootLayout() {
  const theme = useColorScheme() === "dark" ? DarkTheme : DefaultTheme;
  const isTV = getDeviceType() === "tv";
  console.log("theme", useColorScheme());
  useAutoUpdates();
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          <ThemeProvider value={theme}>
            <PortalProvider>
              <SystemBars style="light" />
              <GlobalBackdrop />
              <StackNavigator isTV={isTV} />
            </PortalProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
