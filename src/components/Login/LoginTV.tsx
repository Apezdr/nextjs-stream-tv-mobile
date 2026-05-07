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
    server,
    state,
    actions,
    goBackToEnter,
    goToQRStage,
    cancelQR,
  } = useLoginLogic();

  const { stage, loading, qrCode, userCode, qrPolling } = state;

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
        reloadProviders={actions.reloadProviders}
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
              hasTVPreferredFocus
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
                  actions.setDeviceCode(null);
                  actions.setUserCode(null);
                  actions.setQrCode(null);
                  actions.setQrPolling(false);
                }}
                style={[styles.button, styles.connectButton]}
                textStyle={styles.buttonText}
                focusedStyle={styles.buttonFocused}
                hasTVPreferredFocus
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

    // ── YouTube-style full-screen two-column layout
    return (
      <TVFocusGuideView style={styles.qrFullScreenContainer}>
        {/* Left Panel - Sign-in options */}
        <View style={styles.qrLeftPanel}>
          <Text style={styles.qrPageTitle}>Sign in with QR Code</Text>
          <Text style={styles.qrPageDescription}>
            Scan the QR code with your phone or visit the link to the right to
            sign in to your account on this device.
          </Text>

          {/* Back button at bottom of left panel */}
          <FocusableButton
            title="Go back to set new site name"
            onPress={() => {
              cancelQR();
              goBackToEnter();
            }}
            style={[styles.backButton, { marginTop: "auto", marginBottom: 0 }]}
            textStyle={styles.backButtonText}
            focusedStyle={styles.backButtonFocused}
            hasTVPreferredFocus
          />
        </View>

        {/* Right Panel - QR code and device code */}
        <View style={styles.qrRightPanel}>
          {/* QR Code Card */}
          <View style={styles.qrCodeCard}>
            <QRCode
              value={qrCode}
              size={190}
              logoSVG={splashSvgString}
              logoSize={45}
              logoBorderRadius={15}
              logoColor={"black"}
            />
          </View>

          {/* URL Box */}
          <View style={styles.qrUrlBox}>
            <Text style={styles.qrUrlBoxTextTop}>Scan or go to</Text>
            <Text style={styles.qrUrlBoxText}>
              {server
                ? new URL(server).protocol + "//" + new URL(server).hostname
                : "your-server.com"}
              /device
            </Text>
          </View>

          {/* Device Code Display */}
          <View style={styles.qrDeviceCodeContainer}>
            <Text style={styles.qrDeviceCodeLabel}>Enter the code:</Text>
            {userCode ? (
              <Text style={styles.qrDeviceCodeValue}>{userCode}</Text>
            ) : null}
          </View>

          {/* Polling Indicator */}
          {qrPolling && (
            <View style={styles.qrPollingIndicator}>
              <ActivityIndicator
                size="small"
                color={Colors.dark.brandPrimary}
              />
              <Text style={styles.pollingText}>Waiting for sign-in...</Text>
            </View>
          )}
        </View>
      </TVFocusGuideView>
    );
  }

  return null;
}
