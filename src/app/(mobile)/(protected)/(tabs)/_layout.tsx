// app/(mobile)/(protected)/(tabs)/_layout.tsx
import { Tabs } from "expo-router";

import OptimizedTabBar from "@/src/components/OptimizedTabBar";
import { TabBarIcon } from "@/src/components/TabBarIcon";
import {
  MOBILE_NAVIGATION_ROUTES,
  MOBILE_TAB_CONFIG,
  MOBILE_TAB_COLORS,
} from "@/src/constants/MobileNavConstants";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <OptimizedTabBar {...props} />}
      screenOptions={{
        animation: "shift",
        headerShown: false,
        tabBarActiveTintColor: MOBILE_TAB_COLORS.ACTIVE_TINT,
        tabBarInactiveTintColor: MOBILE_TAB_COLORS.INACTIVE_TINT,
      }}
    >
      {MOBILE_NAVIGATION_ROUTES.map((route) => (
        <Tabs.Screen
          key={route.key}
          name={route.path}
          options={{
            title: route.title,
            tabBarIcon: ({ focused, color }) => (
              <TabBarIcon
                name={focused ? route.focusedIcon || route.icon : route.icon}
                size={MOBILE_TAB_CONFIG.ICON_SIZE}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
