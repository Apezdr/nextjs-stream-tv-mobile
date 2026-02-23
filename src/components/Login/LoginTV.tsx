import { Redirect } from "expo-router";
import { useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  View,
  Text,
  TVFocusGuideView,
  useTVEventHandler,
  TVEventControl,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import ChooseStage from "./components/ChooseStage";
import EnterStage from "./components/EnterStage";
import { useLoginLogic } from "./hooks/useLoginLogic";
import { createSharedStyles, createTVFocusStyles } from "./styles/sharedStyles";

import FocusableButton from "@/src/components/basic/TV/Parts/Button";
import FocusableTextInput from "@/src/components/basic/TV/Parts/Input";
import Card from "@/src/components/common/Card";
import { Colors } from "@/src/constants/Colors";

// Raw SVG string for QRCode logoSVG prop
const splashSvgString = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 27 22"
  fill="currentColor"
>
  <path
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="M6.99906 0.5L6.57031 0.742752L0.570312 10.7428V11.2572L6.57031 21.2572L6.99906 21.5H18.9991L19.3526 20.6464L16.8526 18.1464L16.4991 18H9.27424L4.8409 11L9.27424 4H16.4991L16.8526 3.85355L19.3526 1.35355L18.9991 0.5H6.99906Z"
  />
  <path
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="M20.7927 4.21875L18.3657 6.64575L18.2969 7.2668L20.6605 10.9993L18.2969 14.7318L18.3657 15.3529L20.7927 17.7799L21.5751 17.6835L25.4311 11.2565V10.7421L21.5751 4.31507L20.7927 4.21875Z"
  />
</svg>`;

export default function LoginTV() {
  const {
    ready,
    user,
    state,
    actions,
    goBackToEnter,
    goBackToChoose,
    goToQRStage,
    cancelQR,
  } = useLoginLogic();

  const { stage, loading, qrCode, qrPolling } = state;

  // ── TV remote play/pause resets us to enter
  const tvEventHandler = useCallback(
    (event: { eventType: string }) => {
      if (event.eventType === "playPause") {
        actions.setHost("");
        actions.setStage("enter");
      }
    },
    [actions],
  );

  // Register TV event handler
  useTVEventHandler(tvEventHandler);

  // ── Enable the pan gesture guide on mount
  useEffect(() => {
    TVEventControl.enableTVPanGesture();
    return () => TVEventControl.disableTVPanGesture();
  }, []);

  // Create styles
  const sharedStyles = createSharedStyles(true); // true for TV platform
  const tvFocusStyles = createTVFocusStyles();
  const styles = { ...sharedStyles, ...tvFocusStyles };

  // ── 1) still loading your rehydration?
  if (!ready) {
    return <ActivityIndicator style={styles.centered} />;
  }

  // ── 2) already signed in?
  if (user) {
    return <Redirect href="/" withAnchor />;
  }

  // ── 3) ask for host
  if (stage === "enter") {
    return (
      <EnterStage
        state={state}
        actions={actions}
        isTVPlatform={true}
        styles={styles}
        Container={TVFocusGuideView}
        TextInput={FocusableTextInput}
        Button={FocusableButton}
      />
    );
  }

  // ── 4) show SSO options
  if (stage === "choose") {
    return (
      <ChooseStage
        state={state}
        isTVPlatform={true}
        styles={styles}
        signInWithProvider={actions.signInWithProvider}
        goBackToEnter={goBackToEnter}
        goToQRStage={goToQRStage}
        Container={TVFocusGuideView}
        Button={FocusableButton}
      />
    );
  }

  // ── 5) QR pairing screen
  if (stage === "qr") {
    if (loading) {
      return (
        <TVFocusGuideView style={styles.container}>
          <Card style={styles.authCard}>
            <View style={styles.qrLoadingContainer}>
              <ActivityIndicator
                size="large"
                color={Colors.dark.brandPrimary}
              />
              <Text style={styles.authTitle}>Generating QR Code</Text>
              <Text style={styles.authSubtitle}>
                Please wait while we prepare your authentication code
              </Text>
            </View>

            <FocusableButton
              title="Go back to set new site name"
              onPress={goBackToEnter}
              style={styles.backButton}
              textStyle={styles.backButtonText}
              focusedStyle={styles.backButtonFocused}
            />
          </Card>
        </TVFocusGuideView>
      );
    }

    if (!qrCode) {
      return (
        <TVFocusGuideView style={styles.container}>
          <Card style={styles.authCard}>
            <Text style={styles.authTitle}>QR Code Failed</Text>
            <Text style={styles.authSubtitle}>
              Unable to generate QR code. Please try again.
            </Text>

            <View style={styles.qrErrorActions}>
              <FocusableButton
                title="Try Again"
                onPress={() => {
                  actions.setQrSessionId(null);
                  actions.setQrCode(null);
                  actions.setQrPolling(false);
                }}
                style={[styles.button, styles.connectButton]}
                textStyle={styles.buttonText}
                focusedStyle={styles.buttonFocused}
              />

              <FocusableButton
                title="Go back to set new site name"
                onPress={goBackToEnter}
                style={styles.backButton}
                textStyle={styles.backButtonText}
                focusedStyle={styles.backButtonFocused}
              />
            </View>
          </Card>
        </TVFocusGuideView>
      );
    }

    return (
      <TVFocusGuideView style={styles.container}>
        <Card style={styles.authCard}>
          <Text style={styles.authTitle}>
            {qrPolling ? "Scan QR Code" : "Authentication Ready"}
          </Text>
          <Text style={styles.authSubtitle}>
            {qrPolling
              ? "Use your mobile device to approve TV sign-in"
              : "Scan the code below to authenticate"}
          </Text>

          <View style={styles.qrContainer}>
            <QRCode
              value={qrCode}
              size={200} // TV-specific size
              logoSVG={splashSvgString}
              logoSize={40}
              logoBorderRadius={15}
              logoColor={"black"}
            />
            {qrPolling && (
              <Text style={styles.pollingText}>
                Waiting for authentication...
              </Text>
            )}
          </View>

          <View style={styles.qrInstructions}>
            <Text style={styles.instructionsTitle}>How to sign in:</Text>
            <Text style={styles.instructionStep}>
              1. Open your mobile camera or QR scanner
            </Text>
            <Text style={styles.instructionStep}>
              2. Scan the QR code shown above
            </Text>
            <Text style={styles.instructionStep}>
              3. Complete sign-in on your mobile device
            </Text>
            <Text style={[styles.instructionStep, styles.lastInstruction]}>
              4. You'll be signed in automatically on TV
            </Text>
          </View>

          <FocusableButton
            title="Go back to set new site name"
            onPress={() => {
              cancelQR();
              goBackToEnter();
            }}
            style={styles.backButton}
            textStyle={styles.backButtonText}
            focusedStyle={styles.backButtonFocused}
          />
        </Card>
      </TVFocusGuideView>
    );
  }

  return null;
}
