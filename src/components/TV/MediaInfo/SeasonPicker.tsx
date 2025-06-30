import React from "react";
import { Text, StyleSheet, ScrollView, Pressable } from "react-native";

import { Colors } from "@/src/constants/Colors";
import { TVDeviceNavigation } from "@/src/data/types/content.types";

interface SeasonPickerProps {
  navigation: TVDeviceNavigation;
  availableSeasons: number[];
  currentSeason: number;
  onSeasonChange: (season: number) => void;
}

export default function SeasonPicker({
  navigation,
  availableSeasons,
  currentSeason,
  onSeasonChange,
}: SeasonPickerProps) {
  const seasons = availableSeasons;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {seasons.map((seasonNumber) => (
        <Pressable
          key={seasonNumber}
          focusable
          style={({ focused }) => [
            styles.seasonItem,
            seasonNumber === currentSeason && styles.seasonItemActive,
            focused && styles.seasonItemFocused,
          ]}
          onPress={() => onSeasonChange(seasonNumber)}
        >
          <Text
            style={[
              styles.seasonText,
              seasonNumber === currentSeason && styles.seasonTextActive,
            ]}
          >
            Season {seasonNumber}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 0,
  },
  seasonItem: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    marginVertical: 3,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  seasonItemActive: {
    backgroundColor: Colors.dark.tint,
  },
  seasonItemFocused: {
    backgroundColor: Colors.dark.tint,
    borderColor: "#FFFFFF",
    borderWidth: 2,
  },
  seasonText: {
    color: "#CCCCCC",
    fontSize: 16,
    fontWeight: "500",
  },
  seasonTextActive: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
});
