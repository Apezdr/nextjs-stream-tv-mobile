import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { View, StyleSheet, Text, Pressable, TVFocusGuideView } from "react-native";

import { useQualityPreferencesStore } from "@/src/stores/qualityPreferencesStore";
import { getPlatformClass } from "@/src/utils/deviceInfo";
import { globalDefaultOptions } from "@/src/utils/qualityTiers";

export default function SettingsPage() {
  const globalDefault = useQualityPreferencesStore((s) => s.globalDefault);
  const setGlobalDefault = useQualityPreferencesStore(
    (s) => s.setGlobalDefault,
  );

  const qualityOptions = useMemo(
    () => globalDefaultOptions(getPlatformClass()),
    [],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      {/* Playback quality default (delivery-tiers contract). A tier picked
          inside the player is remembered per title and overrides this. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Playback quality</Text>
        <TVFocusGuideView autoFocus>
          {qualityOptions.map((option, index) => {
            const isSelected = option.id === globalDefault;
            return (
              <Pressable
                key={option.id}
                style={({ focused }) => [
                  styles.optionRow,
                  isSelected && styles.optionRowSelected,
                  focused && styles.optionRowFocused,
                ]}
                onPress={() => setGlobalDefault(option.id)}
                focusable
                isTVSelectable
                hasTVPreferredFocus={index === 0}
              >
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  <Text style={styles.optionDescription}>
                    {option.description}
                  </Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                )}
              </Pressable>
            );
          })}
        </TVFocusGuideView>
        <Text style={styles.sectionFootnote}>
          Picking a quality inside the player remembers it for that title.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#141414",
    flex: 1,
    paddingHorizontal: 80,
    paddingTop: 60,
  },
  optionDescription: {
    color: "#8C8C8C",
    fontSize: 16,
    marginTop: 4,
  },
  optionLabel: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "500",
  },
  optionRow: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0)",
    borderRadius: 10,
    borderWidth: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  optionRowFocused: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderColor: "#FFFFFF",
  },
  optionRowSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  optionText: {
    flexShrink: 1,
    paddingRight: 24,
  },
  section: {
    maxWidth: 720,
  },
  sectionFootnote: {
    color: "#8C8C8C",
    fontSize: 14,
    marginTop: 8,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 14,
    textTransform: "uppercase",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 30,
  },
});
