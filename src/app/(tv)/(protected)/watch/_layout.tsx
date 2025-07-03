import { Slot } from "expo-router";
import { View, StyleSheet } from "react-native";

// This ensures only one instance of the watch route exists regardless of URL params
// Prevents multiple video player instances from being created
export const unstable_settings = {
  dangerouslySingular: true,
};

export default function WatchLayout() {
  console.log("WatchLayout rendered");
  return (
    <View style={styles.container}>
      {/* The actual route content */}
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#141414",
    flex: 1,
  },
});
