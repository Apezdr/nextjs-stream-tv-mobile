import { Component, ReactNode, ErrorInfo } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";

import { Colors } from "@/src/constants/Colors";

interface ErrorAction {
  label: string;
  onPress: () => void;
  primary?: boolean;
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onRetry?: () => void;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  // Platform-specific styling
  variant?: "tv" | "mobile";
  // Support for multiple actions
  actions?: ErrorAction[];
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Universal Error Boundary component following React best practices
 * Works for both TV and Mobile platforms with appropriate fallback UIs
 *
 * Usage:
 * <ErrorBoundary fallback={<CustomFallback />} variant="mobile">
 *   <ComponentThatMightThrow />
 * </ErrorBoundary>
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error for debugging
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // TODO: Send error to logging service
    // logErrorToService(error, errorInfo);
  }

  handleRetry = () => {
    // Reset error state to retry rendering
    this.setState({ hasError: false, error: undefined });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      // If custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Otherwise, render platform-appropriate default fallback
      const isTv = this.props.variant === "tv" || Platform.isTV;

      return (
        <View style={[styles.container, isTv && styles.tvContainer]}>
          <View
            style={[styles.errorContainer, isTv && styles.tvErrorContainer]}
          >
            <Text style={[styles.errorTitle, isTv && styles.tvErrorTitle]}>
              Something went wrong
            </Text>
            <Text style={[styles.errorMessage, isTv && styles.tvErrorMessage]}>
              {this.state.error?.message || "An unexpected error occurred"}
            </Text>
            {/* Render multiple action buttons */}
            {(this.props.actions || this.props.onRetry) && (
              <View
                style={[
                  styles.actionsContainer,
                  isTv && styles.tvActionsContainer,
                ]}
              >
                {this.props.actions ? (
                  this.props.actions.map((action, index) => (
                    <Pressable
                      key={action.label}
                      focusable
                      hasTVPreferredFocus={
                        isTv && (action.primary || index === 0)
                      }
                      style={({ focused }) => [
                        styles.actionButton,
                        action.primary && styles.primaryActionButton,
                        isTv && styles.tvActionButton,
                        action.primary && isTv && styles.tvPrimaryActionButton,
                        focused && isTv && styles.tvActionButtonFocused,
                        focused && !isTv && styles.mobileActionButtonPressed,
                      ]}
                      onPress={action.onPress}
                    >
                      <Text
                        style={[
                          styles.actionButtonText,
                          action.primary && styles.primaryActionButtonText,
                          isTv && styles.tvActionButtonText,
                        ]}
                      >
                        {action.label}
                      </Text>
                    </Pressable>
                  ))
                ) : (
                  <Pressable
                    focusable
                    hasTVPreferredFocus={isTv}
                    style={({ focused }) => [
                      styles.actionButton,
                      styles.primaryActionButton,
                      isTv && styles.tvActionButton,
                      isTv && styles.tvPrimaryActionButton,
                      focused && isTv && styles.tvActionButtonFocused,
                      focused && !isTv && styles.mobileActionButtonPressed,
                    ]}
                    onPress={this.handleRetry}
                  >
                    <Text
                      style={[
                        styles.actionButtonText,
                        styles.primaryActionButtonText,
                        isTv && styles.tvActionButtonText,
                      ]}
                    >
                      Try Again
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Development-only error details */}
            {__DEV__ && this.state.error && (
              <View style={styles.devErrorDetails}>
                <Text style={styles.devErrorTitle}>
                  Error Details (Dev Only):
                </Text>
                <Text style={styles.devErrorText} numberOfLines={10}>
                  {String(
                    this.state.error.stack ||
                      this.state.error.message ||
                      this.state.error.toString() ||
                      "Unknown error",
                  )}
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  // Base styles
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
  errorTitle: {
    color: "#E50914",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  errorMessage: {
    color: Colors.dark.whiteText,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    textAlign: "center",
  },
  // Actions container
  actionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  tvActionsContainer: {
    gap: 16,
  },

  // Action buttons
  actionButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 8,
    minWidth: 100,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  primaryActionButton: {
    backgroundColor: Colors.dark.brandPrimary,
  },
  actionButtonText: {
    color: Colors.dark.whiteText,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  primaryActionButtonText: {
    fontWeight: "bold",
  },
  mobileActionButtonPressed: {
    opacity: 0.7,
  },

  // TV-specific styles
  tvContainer: {
    // TV-specific container adjustments if needed
  },
  tvErrorContainer: {
    alignSelf: "center",
    maxWidth: 600,
  },
  tvErrorTitle: {
    fontSize: 28,
    marginBottom: 16,
  },
  tvErrorMessage: {
    fontSize: 18,
    marginBottom: 32,
  },
  tvActionButton: {
    minWidth: 140,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  tvPrimaryActionButton: {
    // TV-specific primary button styling if needed
  },
  tvActionButtonFocused: {
    borderColor: Colors.dark.tint,
    borderWidth: 2,
  },
  tvActionButtonText: {
    fontSize: 18,
    fontWeight: "bold",
  },

  // Development error details
  devErrorDetails: {
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: 8,
    marginTop: 24,
    maxWidth: "100%",
    padding: 16,
  },
  devErrorTitle: {
    color: "#FF6B6B",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  devErrorText: {
    color: "#CCCCCC",
    fontFamily: Platform.select({ ios: "Courier", android: "monospace" }),
    fontSize: 12,
  },
});
