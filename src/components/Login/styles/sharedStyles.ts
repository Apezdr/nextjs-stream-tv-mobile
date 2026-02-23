import { StyleSheet } from "react-native";

import { Colors } from "@/src/constants/Colors";

export const createSharedStyles = (isTVPlatform: boolean) =>
  StyleSheet.create({
    // Base styles used by both platforms
    button: {
      height: 50,
      marginVertical: isTVPlatform ? 2 : 5,
      width: isTVPlatform ? "80%" : "100%",
    },
    buttonText: { color: Colors.dark.inputText, fontSize: 18 },
    centered: { alignItems: "center", flex: 1, justifyContent: "center" },
    container: {
      alignItems: "center",
      backgroundColor: Colors.dark.background,
      flex: 1,
      justifyContent: "center",
      ...(isTVPlatform ? {} : { paddingHorizontal: 20 }),
    },
    // Enhanced auth card styles
    authCard: {
      alignItems: "center",
      maxWidth: isTVPlatform ? 500 : 400,
      width: isTVPlatform ? "85%" : "100%",
    },
    logoContainer: {
      alignItems: "center",
      marginBottom: 12,
    },
    logo: {
      height: 64,
      width: 78,
    },
    authTitle: {
      color: Colors.dark.text,
      fontSize: isTVPlatform ? 28 : 24,
      fontWeight: "600",
      marginBottom: 8,
      textAlign: "center",
    },
    authSubtitle: {
      color: Colors.dark.placeholderText,
      fontSize: 16,
      marginBottom: isTVPlatform ? 8 : 20,
      textAlign: "center",
    },
    enterForm: {
      alignItems: "center",
      gap: 16,
      width: "100%",
    },
    connectButton: {
      backgroundColor: Colors.dark.brandPrimary,
      width: "100%",
    },
    providersContainer: {
      gap: isTVPlatform ? 2 : 8,
      marginBottom: isTVPlatform ? 15 : 20,
      width: "100%",
    },
    backButton: {
      backgroundColor: Colors.dark.outline,
      height: 48,
      marginTop: isTVPlatform ? 4 : 8,
      width: "100%",
    },
    backButtonText: {
      color: Colors.dark.text,
      fontSize: 16,
    },
    input: {
      backgroundColor: Colors.dark.inputBackground,
      borderRadius: 8,
      color: Colors.dark.inputText,
      fontSize: 18,
      height: 50,
      marginBottom: 0,
      paddingHorizontal: 15,
      width: "100%",
    },
    recentHostButton: {
      alignItems: "center",
      backgroundColor: Colors.dark.inputBackground,
      borderRadius: 6,
      height: isTVPlatform ? 35 : 40,
      justifyContent: "center",
      marginRight: isTVPlatform ? 10 : 8,
      ...(isTVPlatform ? { width: "85%" } : { flex: 1 }),
    },
    recentHostButtonText: {
      color: Colors.dark.text,
      fontSize: 16,
      textAlign: "center",
    },
    recentHostContainer: {
      alignItems: "center",
      flexDirection: "row",
      marginBottom: isTVPlatform ? 0 : 8,
      width: "100%",
    },
    recentLabel: {
      color: Colors.dark.placeholderText,
      fontSize: isTVPlatform ? 18 : 16,
      marginBottom: isTVPlatform ? 2 : 8,
      textAlign: isTVPlatform ? "center" : "left",
      ...(isTVPlatform ? {} : { width: "100%" }),
    },
    recentScrollView: {
      maxHeight: isTVPlatform ? 200 : 150,
      width: "100%",
    },
    recentSection: {
      alignItems: isTVPlatform ? "center" : "flex-start",
      marginTop: isTVPlatform ? 8 : 16,
      width: "100%",
    },
    removeButton: {
      backgroundColor: Colors.dark.icon,
      borderRadius: 6,
      height: 40,
      width: 40,
    },
    removeButtonText: {
      color: Colors.dark.inputText,
      fontSize: isTVPlatform ? 20 : 18,
      fontWeight: "bold",
    },
  });

// TV-specific focus styles
export const createTVFocusStyles = () =>
  StyleSheet.create({
    buttonFocused: {
      backgroundColor: Colors.dark.link,
      transform: [{ scale: 1.05 }],
    },
    inputFocused: {
      borderColor: Colors.dark.link,
      borderWidth: 2,
      transform: [{ scale: 1.05 }],
    },
    qrButton: {
      backgroundColor: Colors.dark.qrBg,
      borderColor: Colors.dark.qrBorder,
      marginTop: 2,
      opacity: 0.3,
      width: "100%",
    },
    qrButtonText: {
      color: Colors.dark.qrText,
      fontSize: 18,
    },
    qrButtonFocused: {
      backgroundColor: Colors.dark.qrBg,
      opacity: 1,
      transform: [{ scale: 1.05 }],
    },
    backButtonFocused: {
      backgroundColor: Colors.dark.icon,
      opacity: 1,
      transform: [{ scale: 1.02 }],
    },
    recentHostButtonFocused: {
      backgroundColor: Colors.dark.link,
      transform: [{ scale: 1.02 }],
    },
    removeButtonFocused: {
      backgroundColor: Colors.dark.link,
      transform: [{ scale: 1.1 }],
    },
    // QR-specific styles for TV
    qrLoadingContainer: {
      alignItems: "center",
      marginBottom: 12,
    },
    qrErrorActions: {
      gap: 4,
      marginTop: 16,
      width: "100%",
    },
    qrContainer: {
      alignItems: "center",
      marginVertical: 2,
    },
    qrInstructions: {
      paddingHorizontal: 16,
      width: "100%",
    },
    instructionsTitle: {
      color: Colors.dark.inputText,
      fontSize: 16,
      fontWeight: "600",
      marginBottom: 4,
    },
    instructionStep: {
      color: Colors.dark.placeholderText,
      fontSize: 14,
      marginBottom: 0,
      paddingLeft: 4,
    },
    lastInstruction: {
      marginBottom: 10,
    },
    pollingText: {
      color: Colors.dark.placeholderText,
      fontSize: 16,
      marginTop: 15,
      textAlign: "center",
    },
  });

// Mobile-specific provider styles
export const createMobileProviderStyles = () =>
  StyleSheet.create({
    providerButton: {
      backgroundColor: Colors.dark.qrBg,
      borderColor: Colors.dark.qrBorder,
      borderWidth: 1,
      marginTop: 2,
      opacity: 1, // Mobile providers should be fully visible
      width: "100%",
    },
    providerButtonText: {
      color: Colors.dark.qrText,
      fontSize: 18,
    },
    providerButtonFocused: {
      backgroundColor: Colors.dark.qrBg,
      borderColor: Colors.dark.link,
      opacity: 1,
      transform: [{ scale: 1.05 }],
    },
  });
