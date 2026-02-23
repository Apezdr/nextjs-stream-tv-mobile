import React from "react";
import { View, Text, ScrollView } from "react-native";

import type { LoginState, LoginActions } from "../types";

import Card from "@/src/components/common/Card";

interface EnterStageProps {
  state: LoginState;
  actions: LoginActions;
  isTVPlatform: boolean;
  styles: any;
  // Platform-specific components
  Container: React.ComponentType<any>;
  TextInput: React.ComponentType<any>;
  Button: React.ComponentType<any>;
}

export default function EnterStage({
  state,
  actions,
  isTVPlatform,
  styles,
  Container,
  TextInput,
  Button,
}: EnterStageProps) {
  const { host, loading, recentlyUsedHosts } = state;
  const { setHost, selectRecentHost, removeFromRecentlyUsed, tryConnect } =
    actions;

  // Original layout when no recent hosts
  if (recentlyUsedHosts.length === 0) {
    return (
      <Container style={styles.container}>
        <Card style={styles.authCard}>
          <Text style={styles.authTitle}>Connect to Server</Text>
          <Text style={styles.authSubtitle}>
            Enter your server host to get started
          </Text>

          <View style={styles.enterForm}>
            <TextInput
              placeholder="cinema.example.com"
              value={host}
              onChangeText={setHost}
              onSubmitEditing={tryConnect}
              style={styles.input}
              focusedStyle={isTVPlatform ? styles.inputFocused : undefined}
            />
            <Button
              title={loading ? "Checking…" : "Connect"}
              onPress={tryConnect}
              style={[styles.button, styles.connectButton]}
              textStyle={styles.buttonText}
              focusedStyle={isTVPlatform ? styles.buttonFocused : undefined}
            />
          </View>
        </Card>
      </Container>
    );
  }

  // Layout with recent hosts
  return (
    <Container style={styles.container}>
      <Card style={styles.authCard}>
        <Text style={styles.authTitle}>Connect to Server</Text>
        <Text style={styles.authSubtitle}>
          Enter your server host or select from recent
        </Text>

        <View style={styles.enterForm}>
          <TextInput
            placeholder="cinema.example.com"
            value={host}
            onChangeText={setHost}
            onSubmitEditing={tryConnect}
            style={styles.input}
            focusedStyle={isTVPlatform ? styles.inputFocused : undefined}
          />
          <Button
            title={loading ? "Checking…" : "Connect"}
            onPress={tryConnect}
            style={[styles.button, styles.connectButton]}
            textStyle={styles.buttonText}
            focusedStyle={isTVPlatform ? styles.buttonFocused : undefined}
          />
        </View>

        <View style={styles.recentSection}>
          <Text style={styles.recentLabel}>Recently Used:</Text>
          <ScrollView
            style={styles.recentScrollView}
            showsVerticalScrollIndicator={false}
          >
            {recentlyUsedHosts.map((recentHost, index) => (
              <View
                key={`${recentHost}-${index}`}
                style={styles.recentHostContainer}
              >
                <Button
                  title={recentHost}
                  onPress={() => selectRecentHost(recentHost)}
                  style={styles.recentHostButton}
                  textStyle={styles.recentHostButtonText}
                  focusedStyle={
                    isTVPlatform ? styles.recentHostButtonFocused : undefined
                  }
                />
                <Button
                  title="×"
                  onPress={() => removeFromRecentlyUsed(recentHost)}
                  style={styles.removeButton}
                  textStyle={styles.removeButtonText}
                  focusedStyle={
                    isTVPlatform ? styles.removeButtonFocused : undefined
                  }
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </Card>
    </Container>
  );
}
