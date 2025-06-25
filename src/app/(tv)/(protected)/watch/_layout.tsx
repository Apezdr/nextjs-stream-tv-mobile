import { Slot } from "expo-router";
import { View, StyleSheet } from "react-native";

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
