// app/login/_layout.tsx
import "expo-dev-client";
import { Stack } from "expo-router";
import { Platform, View, StyleSheet } from "react-native";

import GlobalBackdrop from "@/src/components/TV/GlobalBackdrop";

// Login layout with backdrop
export default function LoginLayout() {
  const isTV = Platform.isTV;

  if (isTV) {
    return (
      <View style={styles.container}>
        <GlobalBackdrop />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "ios_from_right",
            contentStyle: { backgroundColor: "transparent" },
          }}
        >
          <Stack.Screen name="index" />
        </Stack>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlobalBackdrop />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "default",
          contentStyle: { backgroundColor: "transparent" },
        }}
      >
        <Stack.Screen name="index" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#141414",
    flex: 1,
  },
});
