import React from "react";
import { StyleSheet, ActivityIndicator, View } from "react-native";

import DiscordIcon from "@/src/assets/provider-icons/discord-icon.svg";
import GoogleIcon from "@/src/assets/provider-icons/google-icon.svg";
import FocusableButton from "@/src/components/basic/TV/Parts/Button";
import { Colors } from "@/src/constants/Colors";

interface ProviderButtonProps {
  providerId: string;
  providerName: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  style?: any;
  textStyle?: any;
  focusedStyle?: any;
  isLoading?: boolean; // True if this specific provider is loading
  isAnyProviderLoading?: boolean; // True if any provider is loading (for graying out)
}

const ProviderButton: React.FC<ProviderButtonProps> = ({
  providerId,
  providerName,
  onPress,
  hasTVPreferredFocus = false,
  style,
  textStyle,
  focusedStyle,
  isLoading = false,
  isAnyProviderLoading = false,
}) => {
  const getProviderData = () => {
    switch (providerId.toLowerCase()) {
      case "google":
        return {
          button: styles.googleButton,
          text: styles.googleText,
          focused: styles.googleFocused,
          IconComponent: GoogleIcon,
        };
      case "discord":
        return {
          button: styles.discordButton,
          text: styles.discordText,
          focused: styles.discordFocused,
          IconComponent: DiscordIcon,
        };
      default:
        return {
          button: styles.defaultButton,
          text: styles.defaultText,
          focused: styles.defaultFocused,
          IconComponent: null,
        };
    }
  };

  const providerData = getProviderData();

  // Determine styling based on loading states
  const isGrayedOut = isAnyProviderLoading && !isLoading;
  const dynamicStyle = isGrayedOut ? styles.grayedOut : {};
  const dynamicTextStyle = isGrayedOut ? styles.grayedOutText : {};

  return (
    <View style={styles.buttonContainer}>
      <FocusableButton
        title={isLoading ? `Signing in...` : `Sign in with ${providerName}`}
        onPress={isLoading ? () => {} : onPress} // Disable onPress when loading
        style={[
          styles.baseButton,
          providerData.button,
          style,
          dynamicStyle,
          isLoading && styles.loadingButton,
        ]}
        textStyle={[
          styles.baseText,
          providerData.text,
          textStyle,
          dynamicTextStyle,
          isLoading && styles.loadingText,
        ]}
        focusedStyle={[
          styles.baseFocused,
          providerData.focused,
          focusedStyle,
          isLoading && styles.loadingFocused,
        ]}
        leftIcon={
          isLoading ? undefined : providerData.IconComponent || undefined
        }
        iconSize={24}
        hasTVPreferredFocus={hasTVPreferredFocus && !isLoading}
      />

      {/* Loading indicator overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={Colors.dark.text} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  baseButton: {
    alignSelf: "center",
    borderRadius: 14,
    borderWidth: 1,
    height: 32,
    marginVertical: 2,
    opacity: 0.3,
    width: "54%",
  },
  baseText: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  baseFocused: {
    elevation: 8,
    opacity: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    transform: [{ scale: 1.06 }],
  },
  // Google styles
  googleButton: {
    backgroundColor: Colors.dark.googleBg,
    borderColor: Colors.dark.googleBorder,
  },
  googleText: {
    color: Colors.dark.googleText,
  },
  googleFocused: {
    borderColor: Colors.dark.outlineFocused,
    shadowColor: Colors.dark.focusGlow,
  },
  // Discord styles
  discordButton: {
    backgroundColor: Colors.dark.discordBg,
    borderColor: Colors.dark.discordBg,
  },
  discordText: {
    color: Colors.dark.discordText,
  },
  discordFocused: {
    borderColor: Colors.dark.discordBg,
    shadowColor: Colors.dark.focusGlow,
  },
  // Default provider styles
  defaultButton: {
    backgroundColor: Colors.dark.brandPrimary,
    borderColor: Colors.dark.brandPrimary,
  },
  defaultText: {
    color: Colors.dark.text,
  },
  defaultFocused: {
    borderColor: Colors.dark.outlineFocused,
    shadowColor: Colors.dark.focusGlow,
  },
  // Container for button and loading overlay
  buttonContainer: {
    position: "relative",
  },
  // Loading state styles
  loadingButton: {
    opacity: 0.8,
  },
  loadingText: {
    opacity: 0.7,
  },
  loadingFocused: {
    transform: [{ scale: 1.02 }], // Reduced scale when loading
  },
  loadingOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderRadius: 14,
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  // Grayed out styles for other providers
  grayedOut: {
    opacity: 0.3,
  },
  grayedOutText: {
    opacity: 0.5,
  },
});

export default ProviderButton;
