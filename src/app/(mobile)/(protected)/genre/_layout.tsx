import { Slot, useRouter, usePathname, RelativePathString } from "expo-router";
import { View, StyleSheet } from "react-native";

import ErrorBoundary from "@/src/components/common/ErrorBoundary";

export default function GenreLayout() {
  const router = useRouter();
  const pathname = usePathname() as RelativePathString;

  const errorActions = [
    {
      label: "Try Again",
      onPress: () => {
        router.replace(pathname);
      },
      primary: true,
    },
    {
      label: "Go Back",
      onPress: () => {
        router.back();
      },
    },
  ];

  return (
    <View style={styles.container}>
      <ErrorBoundary variant="mobile" actions={errorActions}>
        <Slot />
      </ErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
