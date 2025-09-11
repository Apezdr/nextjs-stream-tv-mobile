import { Stack } from "expo-router";

export default function EpisodeInfoLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "ios_from_right",
        gestureEnabled: true,
        gestureDirection: "horizontal",
      }}
    >
      <Stack.Screen name="[showId]/[season]/[episode]" />
    </Stack>
  );
}
