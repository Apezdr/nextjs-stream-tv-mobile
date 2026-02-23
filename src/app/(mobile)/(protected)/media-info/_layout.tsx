import { Slot, useRouter, usePathname, RelativePathString } from "expo-router";
import { View, StyleSheet } from "react-native";

import ErrorBoundary from "@/src/components/common/ErrorBoundary";

export default function MobileMediaInfoLayout() {
  const router = useRouter();
  const pathname = usePathname() as RelativePathString;

  const handleError = (error: Error, errorInfo: any) => {
    console.error("[MobileMediaInfoLayout] Error caught by boundary:", error);
    // TODO: Send to error reporting service
  };

  const errorActions = [
    {
      label: "Try Again",
      onPress: () => {
        // Force a re-render by navigating to the same route
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
      <ErrorBoundary
        variant="mobile"
        actions={errorActions}
        onError={handleError}
      >
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
