import { StyleSheet, Alert } from "react-native";

import FocusableButton from "@/src/components/basic/TV/Parts/Button";
import { useAuth } from "@/src/providers/AuthProvider";

interface SignOutButtonProps {
  title?: string;
  confirmMessage?: boolean;
  onSignOutComplete?: () => void;
  style?: object;
  textStyle?: object;
  focusedStyle?: object;
}

export default function SignOutButton({
  title = "Sign Out",
  confirmMessage = true,
  onSignOutComplete,
  style,
  textStyle,
  focusedStyle,
}: SignOutButtonProps) {
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    const performSignOut = async () => {
      try {
        await signOut();
        if (onSignOutComplete) {
          onSignOutComplete();
        }
      } catch (error) {
        console.error("Error signing out:", error);
        Alert.alert("Error", "Failed to sign out. Please try again.");
      }
    };

    if (confirmMessage) {
      Alert.alert("Sign Out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", onPress: performSignOut, style: "destructive" },
      ]);
    } else {
      await performSignOut();
    }
  };

  return (
    <FocusableButton
      title={title}
      onPress={handleSignOut}
      style={[styles.button, style]}
      textStyle={[styles.buttonText, textStyle]}
      focusedStyle={[styles.buttonFocused, focusedStyle]}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#cc3333",
    height: 50,
    marginVertical: 12,
    width: "80%",
  },
  buttonFocused: {
    backgroundColor: "#e53935",
    transform: [{ scale: 1.05 }],
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
  },
});
