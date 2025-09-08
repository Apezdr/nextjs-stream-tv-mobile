import React from "react";
import { StyleSheet } from "react-native";

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
}

const ProviderButton: React.FC<ProviderButtonProps> = ({
  providerId,
  providerName,
  onPress,
  hasTVPreferredFocus = false,
  style,
  textStyle,
  focusedStyle,
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

  return (
    <FocusableButton
      title={`Sign in with ${providerName}`}
      onPress={onPress}
      style={[styles.baseButton, providerData.button, style]}
      textStyle={[styles.baseText, providerData.text, textStyle]}
      focusedStyle={[styles.baseFocused, providerData.focused, focusedStyle]}
      leftIcon={providerData.IconComponent || undefined}
      iconSize={24}
      hasTVPreferredFocus={hasTVPreferredFocus}
    />
  );
};

const styles = StyleSheet.create({
  baseButton: {
    borderRadius: 14,
    borderWidth: 1,
    height: 32,
    marginVertical: 2,
    width: "54%",
    alignSelf: "center",
    opacity: 0.3,
  },
  baseText: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  baseFocused: {
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    transform: [{ scale: 1.06 }],
    opacity: 1,
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
});

export default ProviderButton;
