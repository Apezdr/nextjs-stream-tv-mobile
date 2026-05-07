import LottieView from "lottie-react-native";
import React from "react";
import { View, Text, Alert, ActivityIndicator } from "react-native";

import type { LoginState } from "../types";

import logoAnimation from "@/src/assets/lottie/logo-in.json";
import QRIcon from "@/src/assets/provider-icons/qr-logo.svg";
import Card from "@/src/components/common/Card";
import ProviderButton from "@/src/components/Login/Buttons/ProviderButton";

interface ChooseStageProps {
  state: LoginState;
  isTVPlatform: boolean;
  styles: any;
  signInWithProvider: (providerId: string) => Promise<void>;
  goBackToEnter: () => void;
  reloadProviders: () => Promise<void>;
  goToQRStage?: () => void; // Only TV has this
  // Platform-specific components
  Container: React.ComponentType<any>;
  Button: React.ComponentType<any>;
}

export default function ChooseStage({
  state,
  isTVPlatform,
  styles,
  signInWithProvider,
  goBackToEnter,
  reloadProviders,
  goToQRStage,
  Container,
  Button,
}: ChooseStageProps) {
  const {
    providers,
    providersLoading,
    providersError,
    shouldPlayLogo,
    loadingProviderId,
  } = state;
  const isAnyProviderLoading = loadingProviderId !== null;

  if (providersLoading) {
    return <ActivityIndicator style={styles.centered} />;
  }

  if (providersError || providers.length === 0) {
    return (
      <Container style={styles.container}>
        <Card style={styles.authCard}>
          <Text style={styles.authTitle}>Unable to load sign-in options</Text>
          <Text style={styles.authSubtitle}>
            {providersError ??
              "No sign-in providers are configured on this server."}
          </Text>

          <Button
            title="Retry"
            onPress={() => reloadProviders().catch(() => null)}
            style={[styles.button, styles.connectButton]}
            textStyle={styles.buttonText}
            focusedStyle={isTVPlatform ? styles.buttonFocused : undefined}
            hasTVPreferredFocus={isTVPlatform}
          />

          <Button
            title="Go back to set new site name"
            onPress={goBackToEnter}
            style={styles.backButton}
            textStyle={styles.backButtonText}
            focusedStyle={isTVPlatform ? styles.backButtonFocused : undefined}
          />
        </Card>
      </Container>
    );
  }

  return (
    <Container style={styles.container}>
      <Card style={styles.authCard}>
        <View style={styles.logoContainer}>
          <LottieView
            source={logoAnimation}
            autoPlay={shouldPlayLogo}
            loop={false}
            style={styles.logo}
          />
        </View>
        <Text style={styles.authTitle}>Choose Authentication Method</Text>
        <Text style={styles.authSubtitle}>
          Sign in to access the content on this server
          {isTVPlatform && ", we recommend using QR Code."}
        </Text>

        <View style={styles.providersContainer}>
          {/* QR Code button - only shown on TV */}
          {isTVPlatform && goToQRStage && (
            <Button
              title="Use QR Code"
              onPress={goToQRStage}
              leftIcon={QRIcon}
              iconSize={39}
              style={[styles.button, styles.qrButton]}
              textStyle={styles.qrButtonText}
              focusedStyle={styles.qrButtonFocused}
              hasTVPreferredFocus
            />
          )}

          {/* Provider buttons with platform-specific styling */}
          {providers.map((p) => (
            <ProviderButton
              key={p.id}
              providerId={p.id}
              providerName={p.name}
              onPress={() =>
                signInWithProvider(p.id).catch((err) =>
                  Alert.alert("Login failed", err.message),
                )
              }
              // Loading state props
              isLoading={loadingProviderId === p.id}
              isAnyProviderLoading={isAnyProviderLoading}
              // Use different styling based on platform
              style={
                !isTVPlatform
                  ? [styles.button, styles.providerButton]
                  : undefined
              }
              textStyle={!isTVPlatform ? styles.providerButtonText : undefined}
              focusedStyle={
                !isTVPlatform ? styles.providerButtonFocused : undefined
              }
            />
          ))}
        </View>

        <Button
          title="Go back to set new site name"
          onPress={goBackToEnter}
          style={styles.backButton}
          textStyle={styles.backButtonText}
          focusedStyle={isTVPlatform ? styles.backButtonFocused : undefined}
        />
      </Card>
    </Container>
  );
}
