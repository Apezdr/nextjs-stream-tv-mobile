// app/_layout.tsx
import "expo-dev-client";
import "react-native-gesture-handler";
import {
  ThemeProvider,
  DefaultTheme,
  DarkTheme,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
// import { SafeAreaView } from "react-native-safe-area-context";

import GlobalBackdrop from "../components/TV/GlobalBackdrop";
import { getDeviceType } from "../utils/deviceInfo";

import { PortalProvider } from "@/src/components/common/Portal";
import { AuthProvider, useAuth } from "@/src/providers/AuthProvider";
import { QueryProvider } from "@/src/providers/QueryProvider";

// Prevent the splash screen from auto-hiding before asset loading is complete
SplashScreen.preventAutoHideAsync();

// Inner component that uses the auth context
function StackNavigator({ isTV = getDeviceType() === "tv" }) {
  const { user, ready, apiReady } = useAuth();

  // Determine if user is logged in based on auth context
  const loggedIn = !!user;

  console.log(isTV ? "Running on TV" : "Running on Mobile");
  console.log("User logged in:", loggedIn);

  // Hide splash screen when auth is ready
  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

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
    </Stack>
  );
}

// Root layout with providers
export default function RootLayout() {
  const theme = useColorScheme() === "dark" ? DarkTheme : DefaultTheme;
  const isTV = getDeviceType() === "tv";
  console.log("theme", useColorScheme());
  return (
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
  );
}
