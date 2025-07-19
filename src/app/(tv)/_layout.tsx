// app/(tv)/_layout.tsx
import { Redirect, Stack } from "expo-router";
import { useRef, useEffect } from "react";
import { View, StyleSheet } from "react-native";

import GlobalBackdrop from "@/src/components/TV/GlobalBackdrop";
import { ServerStatusNotification } from "@/src/components/TV/ServerStatusNotification";
import { RemoteActivityProvider } from "@/src/context/RemoteActivityContext";
import { ScreensaverProvider } from "@/src/context/ScreensaverContext";
import {
  TVAppStateProvider,
  useTVAppState,
} from "@/src/context/TVAppStateContext";
import { useAuth } from "@/src/providers/AuthProvider";
import {
  backdropManager,
  BackdropComponentRef,
} from "@/src/utils/BackdropManager";

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
        contentStyle: { backgroundColor: "transparent" },
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
  const backdropRef = useRef<BackdropComponentRef>(null);

  // Register the backdrop component with the manager
  useEffect(() => {
    backdropManager.register(backdropRef);
    console.log("[TVLayout] GlobalBackdrop registered with manager");

    // Cleanup on unmount
    return () => {
      backdropManager.register(null);
      console.log("[TVLayout] GlobalBackdrop unregistered from manager");
    };
  }, []);

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
            {/* Global backdrop component - provides backdrop functionality */}
            <GlobalBackdrop ref={backdropRef} />
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
