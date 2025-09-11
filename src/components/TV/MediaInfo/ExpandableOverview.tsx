import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  TextLayoutEventData,
  NativeSyntheticEvent,
  ScrollView,
} from "react-native";

import { Colors } from "@/src/constants/Colors";
import { useDimensions } from "@/src/hooks/useDimensions";

interface ExpandableOverviewProps {
  overview: string;
  maxLines?: number;
  onTruncationChange?: (isTruncated: boolean) => void;
}

export default function ExpandableOverview({
  overview,
  maxLines = 4,
  onTruncationChange,
}: ExpandableOverviewProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const { window } = useDimensions();
  const screenWidth = window.width;
  const screenHeight = window.height;

  const handleTextLayout = useCallback(
    (event: NativeSyntheticEvent<TextLayoutEventData>) => {
      const { lines } = event.nativeEvent;
      const truncated = lines.length > maxLines;
      setIsTruncated(truncated);
      onTruncationChange?.(truncated);
    },
    [maxLines, onTruncationChange],
  );

  const openModal = useCallback(() => {
    setIsModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalVisible(false);
  }, []);

  return (
    <>
      <View style={styles.container}>
        {isTruncated ? (
          <>
            <Text
              style={styles.overviewText}
              numberOfLines={maxLines}
              onTextLayout={handleTextLayout}
              ellipsizeMode="tail"
            >
              {overview}
            </Text>
            <Pressable
              focusable
              style={({ focused }) => [
                styles.expandButton,
                focused && styles.expandButtonFocused,
              ]}
              onPress={openModal}
            >
              <Text style={styles.expandButtonText}>... Read More</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.overviewText} onTextLayout={handleTextLayout}>
            {overview}
          </Text>
        )}
      </View>

      {/* Full Overview Modal */}
      <Modal
        visible={isModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContainer,
              {
                maxHeight: screenHeight * 0.8,
                width: screenWidth * 0.7,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Overview</Text>
              <Pressable
                focusable
                hasTVPreferredFocus
                style={({ focused }) => [
                  styles.closeButton,
                  focused && styles.closeButtonFocused,
                ]}
                onPress={closeModal}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </Pressable>
            </View>
            <ScrollView
              style={[styles.modalContent, { maxHeight: screenHeight * 0.6 }]}
              contentContainerStyle={styles.modalContentContainer}
              showsVerticalScrollIndicator={true}
              focusable
            >
              <Text style={styles.modalOverviewText}>{overview}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  closeButtonFocused: {
    backgroundColor: Colors.dark.tint,
    borderColor: "#FFFFFF",
    borderWidth: 2,
  },
  closeButtonText: {
    color: Colors.dark.whiteText,
    fontSize: 18,
    fontWeight: "bold",
  },
  container: {
    alignItems: "flex-start",
  },
  expandButton: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  expandButtonFocused: {
    backgroundColor: Colors.dark.tint,
    borderColor: "#FFFFFF",
    borderWidth: 2,
  },
  expandButtonText: {
    color: Colors.dark.whiteText,
    fontSize: 14,
    fontWeight: "bold",
  },
  modalContainer: {
    backgroundColor: Colors.dark.background,
    borderColor: "#333333",
    borderRadius: 12,
    borderWidth: 1,
  },
  modalContent: {},
  modalContentContainer: {
    padding: 24,
  },
  modalHeader: {
    alignItems: "center",
    borderBottomColor: "#333333",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 24,
  },
  modalOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    flex: 1,
    justifyContent: "center",
  },
  modalOverviewText: {
    color: Colors.dark.whiteText,
    fontSize: 18,
    lineHeight: 26,
  },
  modalTitle: {
    color: Colors.dark.whiteText,
    fontSize: 24,
    fontWeight: "bold",
  },
  overviewText: {
    color: Colors.dark.whiteText,
    fontSize: 12,
    lineHeight: 13,
  },
});
