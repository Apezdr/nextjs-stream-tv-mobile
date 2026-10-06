import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  TVFocusGuideView,
} from "react-native";

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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
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
                  <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                )}
              </Pressable>
            );
          })}
        </TVFocusGuideView>
        <Text style={styles.sectionFootnote}>
          Picking a quality inside the player remembers it for that title.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#141414",
    flex: 1,
  },
  optionDescription: {
    color: "#8C8C8C",
    fontSize: 13,
    marginTop: 2,
  },
  optionLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
  optionRow: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0)",
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    paddingRight: 16,
  },
  scrollContent: {
    paddingBottom: 40,
    paddingHorizontal: 40,
    paddingTop: 20,
  },
  section: {
    maxWidth: 560,
  },
  sectionFootnote: {
    color: "#8C8C8C",
    fontSize: 12,
    marginTop: 6,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 16,
  },
});
