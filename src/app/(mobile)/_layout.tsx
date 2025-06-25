// app/(mobile)/_layout.tsx
import { Redirect, Tabs } from "expo-router";

import { TabBarIcon } from "@/src/components/TabBarIcon";
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

  // logged in → render your mobile navigation
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="(protected)/index"
        options={{
          title: "Mobile Home",
          tabBarIcon: () => <TabBarIcon name="home-sharp" />,
        }}
      />
      {/* Add more TV-specific tabs here */}
    </Tabs>
  );
}
