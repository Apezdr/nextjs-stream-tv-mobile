import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";

import { Colors } from "@/src/constants/Colors";

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
}

const Card: React.FC<CardProps> = ({ children, style, elevated = false }) => {
  return (
    <View style={[styles.card, elevated && styles.cardElevated, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.surfaceCard,
    borderColor: Colors.dark.outline,
    borderRadius: 16,
    borderWidth: 1,
    elevation: 4,
    padding: 24,
    shadowColor: Colors.dark.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  cardElevated: {
    backgroundColor: Colors.dark.surfaceElevated,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
});

export default Card;
