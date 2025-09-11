import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import MobileBanner from "./MobileBanner";

/**
 * Example implementation showing how to use MobileBanner with proper scroll prevention
 * 
 * This example demonstrates the recommended pattern for preventing vertical scrolling
 * when users interact with the gesture-enabled banner component.
 */
export default function MobileBannerExampleScreen() {
  // Track whether the banner gesture is currently active
  const [isBannerGestureActive, setIsBannerGestureActive] = useState(false);

  return (
    <ScrollView 
      style={styles.container}
      scrollEnabled={!isBannerGestureActive} // Key: disable scrolling when banner gesture is active
      showsVerticalScrollIndicator={true}
    >
      {/* Enhanced MobileBanner with gesture callbacks */}
      <MobileBanner
        onGestureStart={() => setIsBannerGestureActive(true)}
        onGestureEnd={() => setIsBannerGestureActive(false)}
      />
      
      {/* Example content below the banner */}
      <View style={styles.contentSection}>
        <Text style={styles.sectionTitle}>Featured Content</Text>
        {Array(20).fill(0).map((_, i) => (
          <View key={i} style={styles.contentItem}>
            <Text style={styles.contentText}>Content Item {i + 1}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  contentSection: {
    padding: 15,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "white",
    marginBottom: 15,
  },
  contentItem: {
    backgroundColor: "#1e1e1e",
