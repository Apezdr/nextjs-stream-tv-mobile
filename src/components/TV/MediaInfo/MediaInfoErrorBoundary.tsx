import { Component, ReactNode, ErrorInfo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";

import { Colors } from "@/src/constants/Colors";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class MediaInfoErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      "MediaInfo Error Boundary caught an error:",
      error,
      errorInfo,
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorMessage}>
              {this.state.error?.message || "An unexpected error occurred"}
            </Text>
            {this.props.onRetry && (
              <Pressable
                focusable
                hasTVPreferredFocus
                style={({ focused }) => [
                  styles.retryButton,
                  focused && styles.retryButtonFocused,
                ]}
                onPress={this.handleRetry}
              >
                <Text style={styles.retryButtonText}>Try Again</Text>
              </Pressable>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.background,
    flex: 1,
  },
  errorContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  errorMessage: {
    color: Colors.dark.whiteText,
    fontSize: 16,
    marginBottom: 24,
    textAlign: "center",
  },
  errorTitle: {
    color: "#E50914",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: Colors.dark.tint,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonFocused: {
    borderColor: "#FFFFFF",
    borderWidth: 2,
  },
  retryButtonText: {
    color: Colors.dark.whiteText,
    fontSize: 16,
    fontWeight: "bold",
  },
});
