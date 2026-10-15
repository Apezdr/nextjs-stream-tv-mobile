// app/(mobile)/_layout.tsx
import { Redirect, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";

import { OfflineNotice } from "@/src/components/Mobile/OfflineNotice";
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

  if (!user.approved) {
    // signed in but not approved → pending-approval screen (keeps protected
    // areas consistent with the root index guard)
    return <Redirect href="/pending-approval" />;
  }

  // logged in → render protected routes
  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="(protected)" />
      </Stack>
      <OfflineNotice />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
