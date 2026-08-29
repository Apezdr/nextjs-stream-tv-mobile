import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  View,
  Text,
  TVFocusGuideView,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import FocusableButton from "@/src/components/basic/TV/Parts/Button";
import Card from "@/src/components/common/Card";
import SessionExpiredNotice from "@/src/components/Login/components/SessionExpiredNotice";
import { useLoginLogic } from "@/src/components/Login/hooks/useLoginLogic";
import {
  createSharedStyles,
  createTVFocusStyles,
} from "@/src/components/Login/styles/sharedStyles";
import { Colors } from "@/src/constants/Colors";

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

const FADE_OUT_DURATION = 450;
const FADE_OUT_STAGGER = 150;

export default function QRScreen() {
  const router = useRouter();
  const { state, actions, cancelQR, server, user, ready, sessionExpired } =
    useLoginLogic("qr");
  const {
    loading,
    qrCode,
    userCode,
    qrPolling,
    providers,
    isQRExpired,
    qrTerminalError,
    qrError,
  } = state;

  // We only reach this screen after /api/status succeeded, so we can tell the
  // user the server connection itself worked and point them at the real cause.
  const displayHost = (() => {
    if (!server) return null;
    try {
      return new URL(server).hostname;
    } catch {
      return server;
    }
  })();

  const sharedStyles = createSharedStyles(true);
  const tvFocusStyles = createTVFocusStyles();
  const styles = { ...sharedStyles, ...tvFocusStyles };

  // Page-level fade-in animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Individual section fade-out animations (start at 1 = visible)
  const leftPanelAnim = useRef(new Animated.Value(1)).current;
  const qrCodeAnim = useRef(new Animated.Value(1)).current;
  const urlBoxAnim = useRef(new Animated.Value(1)).current;
  const deviceCodeAnim = useRef(new Animated.Value(1)).current;

  // Track if we've already started the exit animation
  const exitStarted = useRef(false);

  // Reset opacity and section animations when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fadeAnim.setValue(0);
      leftPanelAnim.setValue(1);
      qrCodeAnim.setValue(1);
      urlBoxAnim.setValue(1);
      deviceCodeAnim.setValue(1);
      exitStarted.current = false;
    }, [fadeAnim, leftPanelAnim, qrCodeAnim, urlBoxAnim, deviceCodeAnim]),
  );

  // Trigger fade-in once QR code is ready (skip loading flash)
  useEffect(() => {
    if (!loading) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }).start();
    }
  }, [loading, fadeAnim]);

  // Staggered fade-out then navigate when user authenticates
  useEffect(() => {
    if (ready && user && !exitStarted.current) {
      exitStarted.current = true;

      // Staggered fade-out: left panel → QR code → URL box → device code
      Animated.stagger(FADE_OUT_STAGGER, [
        Animated.timing(leftPanelAnim, {
          toValue: 0,
          duration: FADE_OUT_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(qrCodeAnim, {
          toValue: 0,
          duration: FADE_OUT_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(urlBoxAnim, {
          toValue: 0,
          duration: FADE_OUT_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(deviceCodeAnim, {
          toValue: 0,
          duration: FADE_OUT_DURATION,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // All sections faded out — navigate to main screen
        router.replace("/");
      });
    }
  }, [
    ready,
    user,
    router,
    leftPanelAnim,
    qrCodeAnim,
    urlBoxAnim,
    deviceCodeAnim,
  ]);

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: fadeAnim,
        backgroundColor: Colors.dark.background,
      }}
    >
      {loading ? (
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
              onPress={() => router.back()}
              style={styles.backButton}
              textStyle={styles.backButtonText}
              focusedStyle={styles.backButtonFocused}
              hasTVPreferredFocus
            />
          </Card>
        </TVFocusGuideView>
      ) : !qrCode ? (
        <TVFocusGuideView style={styles.container}>
          <Card style={styles.authCard}>
            <Text style={styles.authTitle}>
              Couldn&apos;t get a sign-in code
            </Text>
            <Text style={styles.authSubtitle}>
              {displayHost
                ? `Connected to ${displayHost}, but it didn't return a sign-in code.`
                : "The server didn't return a sign-in code."}
            </Text>
            {qrError ? (
              <Text style={styles.qrErrorDetail}>{qrError}</Text>
            ) : null}

            <View style={styles.qrErrorActions}>
              <FocusableButton
                title="Try Again"
                onPress={actions.retryQR}
                style={[styles.button, styles.connectButton]}
                textStyle={styles.buttonText}
                focusedStyle={styles.buttonFocused}
                hasTVPreferredFocus
              />

              <FocusableButton
                title="Go back to set new site name"
                onPress={() => router.back()}
                style={styles.backButton}
                textStyle={styles.backButtonText}
                focusedStyle={styles.backButtonFocused}
              />
            </View>
          </Card>
        </TVFocusGuideView>
      ) : isQRExpired || qrTerminalError ? (
        <TVFocusGuideView style={styles.container}>
          <Card style={styles.authCard}>
            <Text style={styles.authTitle}>
              {qrTerminalError === "access_denied"
                ? "Sign-in Denied"
                : qrTerminalError === "server_down"
                  ? "Server Unavailable"
                  : "QR Code Expired"}
            </Text>
            <Text style={styles.authSubtitle}>
              {qrTerminalError === "access_denied"
                ? "The sign-in request was denied on your device. You can try again or go back."
                : qrTerminalError === "server_down"
                  ? "The server is not responding. Check that it's running and try again."
                  : "This code has expired. Refresh to get a new one."}
            </Text>

            <View style={styles.qrErrorActions}>
              {qrTerminalError !== "server_down" && (
                <FocusableButton
                  title={
                    qrTerminalError === "access_denied"
                      ? "Try Again"
                      : "Refresh QR Code"
                  }
                  onPress={actions.refreshQRCode}
                  style={[styles.button, styles.connectButton]}
                  textStyle={styles.buttonText}
                  focusedStyle={styles.buttonFocused}
                  hasTVPreferredFocus
                />
              )}

              <FocusableButton
                title="Go back to set new site name"
                onPress={() => {
                  cancelQR();
                  router.back();
                }}
                style={styles.backButton}
                textStyle={styles.backButtonText}
                focusedStyle={styles.backButtonFocused}
                hasTVPreferredFocus={qrTerminalError === "server_down"}
              />
            </View>
          </Card>
        </TVFocusGuideView>
      ) : (
        /* YouTube-style full-screen two-column layout */
        <TVFocusGuideView style={styles.qrFullScreenContainer}>
          {/* Left Panel — fades out first on auth success */}
          <Animated.View
            style={[styles.qrLeftPanel, { opacity: leftPanelAnim }]}
          >
            <Text style={styles.qrPageTitle}>Sign in with QR Code</Text>
            <SessionExpiredNotice visible={sessionExpired} isTVPlatform />
            <Text style={styles.qrPageDescription}>
              Scan the QR code with your phone or visit the link to the right to
              sign in to your account on this device.
            </Text>

            {/* Alternative sign-in methods */}
            {providers.length > 0 && (
              <>
                <Text style={styles.qrSignInOptionsLabel}>
                  Or sign in with another method:
                </Text>
                <View style={styles.qrOptionsContainer}>
                  {providers.slice(0, 2).map((p) => (
                    <FocusableButton
                      key={p.id}
                      title={`Sign in with ${p.name}`}
                      onPress={() =>
                        actions
                          .signInWithProvider(p.id)
                          .catch((err) =>
                            Alert.alert("Login failed", err.message),
                          )
                      }
                      style={[styles.button, styles.connectButton]}
                      textStyle={styles.buttonText}
                      focusedStyle={styles.buttonFocused}
                    />
                  ))}
                </View>
              </>
            )}

            <FocusableButton
              title="Go back to set new site name"
              onPress={() => {
                cancelQR();
                router.back();
              }}
              style={[
                styles.backButton,
                { marginTop: "auto", marginBottom: 0 },
              ]}
              textStyle={styles.backButtonText}
              focusedStyle={styles.backButtonFocused}
              hasTVPreferredFocus
            />
          </Animated.View>

          {/* Right Panel */}
          <View style={styles.qrRightPanel}>
            {/* QR Code — fades out second */}
            <Animated.View style={[styles.qrCodeCard, { opacity: qrCodeAnim }]}>
              <QRCode
                value={qrCode}
                size={190}
                logoSVG={splashSvgString}
                logoSize={45}
                logoBorderRadius={15}
                logoColor={"black"}
              />
            </Animated.View>

            {/* URL Box — fades out third */}
            <Animated.View style={[styles.qrUrlBox, { opacity: urlBoxAnim }]}>
              <Text style={styles.qrUrlBoxTextTop}>Scan or go to</Text>
              <Text style={styles.qrUrlBoxText}>
                {server
                  ? new URL(server).protocol + "//" + new URL(server).hostname
                  : "your-server.com"}
                /device
              </Text>
            </Animated.View>

            {/* Device Code — fades out last */}
            <Animated.View
              style={[
                styles.qrDeviceCodeContainer,
                { opacity: deviceCodeAnim },
              ]}
            >
              <Text style={styles.qrDeviceCodeLabel}>Enter the code:</Text>
              {userCode ? (
                <Text style={styles.qrDeviceCodeValue}>{userCode}</Text>
              ) : null}
            </Animated.View>

            {/* Polling Indicator */}
            {qrPolling && (
              <Animated.View
                style={[styles.qrPollingIndicator, { opacity: deviceCodeAnim }]}
              >
                <ActivityIndicator
                  size="small"
                  color={Colors.dark.brandPrimary}
                />
                <Text style={styles.pollingText}>Waiting for sign-in...</Text>
              </Animated.View>
            )}
          </View>
        </TVFocusGuideView>
      )}
    </Animated.View>
  );
}
