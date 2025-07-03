// app/(tv)/_layout.tsx
import { Redirect, Stack } from "expo-router";
import { View, StyleSheet } from "react-native";

import { ServerStatusNotification } from "@/src/components/TV/ServerStatusNotification";
import { RemoteActivityProvider } from "@/src/context/RemoteActivityContext";
import { ScreensaverProvider } from "@/src/context/ScreensaverContext";
import {
  TVAppStateProvider,
  useTVAppState,
} from "@/src/context/TVAppStateContext";
import { useAuth } from "@/src/providers/AuthProvider";

// Inner component that uses the TV app state to determine the layout
function TVContent() {
  const { currentMode } = useTVAppState();

  console.log(`TVContent - Current mode: ${currentMode}`);

  // Use Stack navigator for TV routes
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "none", // Disable animations for TV
      }}
    >
      <Stack.Screen name="(protected)/index" />
      <Stack.Screen
        name="(protected)/screensaver"
        dangerouslySingular={true}
        options={{
          headerShown: false,
          gestureEnabled: false,
          animation: "fade",
          presentation: "fullScreenModal",
        }}
      />
    </Stack>
  );
}

export default function TVLayout() {
  console.log("TVLayout rendered");
  const { ready, user } = useAuth();

  if (!ready) {
    // still checking storage → keep splash visible
    return null;
  }

  if (!user) {
    // once ready, if no user, send to login
    return <Redirect href="/login" />;
  }

  // logged in → render TV app with stack navigation
  return (
    // <StrictMode>
    <RemoteActivityProvider>
      <TVAppStateProvider>
        <ScreensaverProvider>
          <View style={styles.container}>
            <TVContent />
            <ServerStatusNotification />
          </View>
        </ScreensaverProvider>
      </TVAppStateProvider>
    </RemoteActivityProvider>
    // </StrictMode>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#141414",
    flex: 1,
  },
});
