// src/components/Mobile/Video/MobileCaptionControls.tsx
import { Ionicons } from "@expo/vector-icons";
import { memo, useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
} from "react-native";

import { Colors } from "@/src/constants/Colors";
import { useDimensions } from "@/src/hooks/useDimensions";

interface CaptionTrack {
  srcLang: string;
  url: string;
  lastModified: string;
  sourceServerId: string;
}

export interface SubtitleStyle {
  id: string;
  name: string;
  description: string;
  textStyle: {
    color: string;
    fontSize: number;
    fontWeight:
      | "normal"
      | "bold"
      | "100"
      | "200"
      | "300"
      | "400"
      | "500"
      | "600"
      | "700"
      | "800"
      | "900";
    backgroundColor?: string;
    textShadowColor?: string;
    textShadowOffset?: { width: number; height: number };
    textShadowRadius?: number;
    borderWidth?: number;
    borderColor?: string;
  };
}

export interface SubtitleBackgroundOption {
  id: string;
  name: string;
  description: string;
  backgroundColor: string;
}

interface MobileCaptionControlsProps {
  captionURLs?: Record<string, CaptionTrack>;
  selectedCaptionLanguage?: string | undefined | null;
  onCaptionLanguageChange?: (language: string | null) => void;
  selectedSubtitleStyle?: SubtitleStyle;
  onSubtitleStyleChange?: (style: SubtitleStyle) => void;
  selectedSubtitleBackground?: SubtitleBackgroundOption;
  onSubtitleBackgroundChange?: (background: SubtitleBackgroundOption) => void;
  onShowControls?: () => void; // Mobile-specific: show controls when user interacts
}

// Predefined accessibility-focused subtitle styles
export const SUBTITLE_STYLES: SubtitleStyle[] = [
  {
    id: "standard",
    name: "Standard",
    description: "Default subtitle appearance with good readability",
    textStyle: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "bold",
      backgroundColor: "transparent",
      textShadowColor: "rgba(0, 0, 0, 0.8)",
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 6,
    },
  },
  {
    id: "large-print",
    name: "Large Print",
    description: "Larger text size for easier reading",
    textStyle: {
      color: "#FFFFFF",
      fontSize: 27,
      fontWeight: "bold",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      textShadowColor: "rgba(0, 0, 0, 0.9)",
      textShadowOffset: { width: 1, height: 1 },
      textShadowRadius: 4,
    },
  },
  {
    id: "high-contrast",
    name: "High Contrast",
    description: "Maximum contrast for better visibility",
    textStyle: {
      color: "#FFFF00",
      fontSize: 18,
      fontWeight: "bold",
      backgroundColor: "rgba(0, 0, 0, 0.9)",
      borderWidth: 2,
      borderColor: "#000000",
    },
  },
  {
    id: "low-vision",
    name: "Low Vision",
    description: "Optimized for users with visual impairments",
    textStyle: {
      color: "#FFFFFF",
      fontSize: 24,
      fontWeight: "bold",
      backgroundColor: "rgba(0, 0, 0, 0.95)",
      borderWidth: 3,
      borderColor: "#FFFFFF",
      textShadowColor: "rgba(0, 0, 0, 1)",
      textShadowOffset: { width: 2, height: 2 },
      textShadowRadius: 8,
    },
  },
];

// Predefined subtitle background options
export const SUBTITLE_BACKGROUND_OPTIONS: SubtitleBackgroundOption[] = [
  {
    id: "transparent",
    name: "Transparent",
    description: "No background behind subtitle text",
    backgroundColor: "transparent",
  },
  {
    id: "slightly-transparent",
    name: "Slightly Transparent",
    description: "Semi-transparent background for better readability",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  {
    id: "opaque",
    name: "Opaque",
    description: "Solid background for maximum contrast",
    backgroundColor: "rgba(0, 0, 0, 0.9)",
  },
];

// Default selections
export const DEFAULT_SUBTITLE_BACKGROUND: SubtitleBackgroundOption =
  SUBTITLE_BACKGROUND_OPTIONS[0]; // Transparent
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = SUBTITLE_STYLES[1]; // Large Print

const MobileCaptionControls = memo(
  ({
    captionURLs,
    selectedCaptionLanguage,
    onCaptionLanguageChange,
    selectedSubtitleStyle,
    onSubtitleStyleChange,
    selectedSubtitleBackground,
    onSubtitleBackgroundChange,
    onShowControls,
  }: MobileCaptionControlsProps) => {
    const [showMoreLanguages, setShowMoreLanguages] = useState(false);
    const [showStyleSettings, setShowStyleSettings] = useState(false);

    const handleCaptionLanguageSelect = useCallback(
      (language: string | null) => {
        onCaptionLanguageChange?.(language);
        setShowMoreLanguages(false);
        onShowControls?.();
      },
      [onCaptionLanguageChange, onShowControls],
    );

    const handleStyleSelect = useCallback(
      (style: SubtitleStyle) => {
        onSubtitleStyleChange?.(style);
        onShowControls?.();
      },
      [onSubtitleStyleChange, onShowControls],
    );

    const handleBackgroundSelect = useCallback(
      (background: SubtitleBackgroundOption) => {
        onSubtitleBackgroundChange?.(background);
        onShowControls?.();
      },
      [onSubtitleBackgroundChange, onShowControls],
    );

    const toggleMoreLanguages = useCallback(() => {
      setShowMoreLanguages(!showMoreLanguages);
      setShowStyleSettings(false);
      onShowControls?.();
    }, [showMoreLanguages, onShowControls]);

    const toggleStyleSettings = useCallback(() => {
      setShowStyleSettings(!showStyleSettings);
      setShowMoreLanguages(false);
      onShowControls?.();
    }, [showStyleSettings, onShowControls]);

    const availableLanguages = captionURLs ? Object.keys(captionURLs) : [];

    // Create main button data for horizontal scroll
    const mainButtons = useMemo(() => {
      const buttons: Array<{
        id: string;
        type: "caption" | "more" | "settings";
        label: string;
        language?: string | null;
        onPress: () => void;
        isSelected?: boolean;
      }> = [];

      // For no captions case, only show settings
      if (!captionURLs || availableLanguages.length === 0) {
        buttons.push({
          id: "settings",
          type: "settings",
          label: "Settings",
          onPress: toggleStyleSettings,
        });
        return buttons;
      }

      // Always add "Off" button first
      buttons.push({
        id: "off",
        type: "caption",
        label: "Off",
        language: null,
        onPress: () => handleCaptionLanguageSelect(null),
        isSelected: selectedCaptionLanguage === null,
      });

      // Add up to 2 languages for main controls, prioritizing English and Spanish
      const prioritizedLanguages: string[] = [];
      const preferredLanguages = ["en", "english", "es", "spanish", "español"];

      // First, add preferred languages if available
      availableLanguages.forEach((language) => {
        if (
          preferredLanguages.some((pref) =>
            language.toLowerCase().includes(pref.toLowerCase()),
          ) &&
          prioritizedLanguages.length < 2
        ) {
          prioritizedLanguages.push(language);
        }
      });

      // Then fill remaining slots with other languages
      availableLanguages.forEach((language) => {
        if (
          !prioritizedLanguages.includes(language) &&
          prioritizedLanguages.length < 2
        ) {
          prioritizedLanguages.push(language);
        }
      });

      // Add the prioritized languages to buttons
      prioritizedLanguages.forEach((language) => {
        buttons.push({
          id: language,
          type: "caption",
          label: language,
          language: language,
          onPress: () => handleCaptionLanguageSelect(language),
          isSelected: selectedCaptionLanguage === language,
        });
      });

      // Add More button only if there are more than 2 languages
      const additionalLanguages = availableLanguages.slice(2);
      if (additionalLanguages.length > 0) {
        buttons.push({
          id: "more",
          type: "more",
          label: "More",
          onPress: toggleMoreLanguages,
        });
      }

      // Always add Settings button
      buttons.push({
        id: "settings",
        type: "settings",
        label: "Settings",
        onPress: toggleStyleSettings,
      });

      return buttons;
    }, [
      availableLanguages,
      selectedCaptionLanguage,
      toggleMoreLanguages,
      toggleStyleSettings,
      handleCaptionLanguageSelect,
    ]);

    const renderButton = useCallback(
      (
        item: {
          id: string;
          type: "caption" | "more" | "settings";
          label: string;
          language?: string | null;
          onPress: () => void;
          isSelected?: boolean;
        },
        index: number,
      ) => {
        if (item.type === "caption") {
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.captionButton,
                item.isSelected && styles.captionButtonSelected,
                index === 0 && styles.firstButton,
              ]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.captionButtonContent}>
                {item.isSelected && (
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color="#fff"
                    style={styles.checkmark}
                  />
                )}
                <Text
                  style={[
                    styles.captionButtonText,
                    item.isSelected && styles.captionButtonTextSelected,
                  ]}
                >
                  {item.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }

        if (item.type === "more") {
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.captionButton, styles.moreButton]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.captionButtonContent}>
                <Text style={styles.captionButtonText}>{item.label}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color="rgba(255, 255, 255, 0.7)"
                />
              </View>
            </TouchableOpacity>
          );
        }

        if (item.type === "settings") {
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.captionButton, styles.settingsButton]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.captionButtonContent}>
                <Ionicons
                  name="settings-outline"
                  size={20}
                  color="rgba(255, 255, 255, 0.7)"
                />
              </View>
            </TouchableOpacity>
          );
        }

        return null;
      },
      [],
    );

    // Get dynamic dimensions that will update with orientation changes
    const { window } = useDimensions();
    const screenHeight = window.height;

    return (
      <View style={styles.container}>
        {/* Main Caption Controls - Horizontal Scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          style={styles.scrollContainer}
        >
          {mainButtons.map((button, index) => renderButton(button, index))}
        </ScrollView>

        {/* More Languages Modal */}
        <Modal
          visible={showMoreLanguages}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowMoreLanguages(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowMoreLanguages(false)}
          >
            <View
              style={[styles.modalContent, { maxHeight: screenHeight * 0.7 }]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Caption Languages</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setShowMoreLanguages(false)}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollView}>
                {/* Off Option */}
                <TouchableOpacity
                  style={[
                    styles.modalOption,
                    selectedCaptionLanguage === null &&
                      styles.modalOptionSelected,
                  ]}
                  onPress={() => handleCaptionLanguageSelect(null)}
                >
                  <View style={styles.modalOptionContent}>
                    {selectedCaptionLanguage === null && (
                      <Ionicons
                        name="checkmark"
                        size={20}
                        color="#FFFFFF"
                        style={styles.modalCheckmark}
                      />
                    )}
                    <Text style={styles.modalOptionText}>Off</Text>
                  </View>
                </TouchableOpacity>

                {/* All Available Languages */}
                {availableLanguages.map((language) => (
                  <TouchableOpacity
                    key={language}
                    style={[
                      styles.modalOption,
                      selectedCaptionLanguage === language &&
                        styles.modalOptionSelected,
                    ]}
                    onPress={() => handleCaptionLanguageSelect(language)}
                  >
                    <View style={styles.modalOptionContent}>
                      {selectedCaptionLanguage === language && (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color="#FFFFFF"
                          style={styles.modalCheckmark}
                        />
                      )}
                      <Text style={styles.modalOptionText}>{language}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Style Settings Modal */}
        <Modal
          visible={showStyleSettings}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowStyleSettings(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowStyleSettings(false)}
          >
            <View
              style={[styles.modalContent, { maxHeight: screenHeight * 0.8 }]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Subtitle Settings</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setShowStyleSettings(false)}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollView}>
                {/* Background Options Section */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Background</Text>
                </View>
                {SUBTITLE_BACKGROUND_OPTIONS.map((background) => (
                  <TouchableOpacity
                    key={background.id}
                    style={[
                      styles.settingsOption,
                      selectedSubtitleBackground?.id === background.id &&
                        styles.settingsOptionSelected,
                    ]}
                    onPress={() => handleBackgroundSelect(background)}
                  >
                    <View style={styles.settingsOptionContent}>
                      <View style={styles.backgroundInfo}>
                        <Text style={styles.settingsOptionTitle}>
                          {background.name}
                        </Text>
                        <Text style={styles.settingsOptionDescription}>
                          {background.description}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.backgroundPreview,
                          { backgroundColor: background.backgroundColor },
                        ]}
                      >
                        <Text style={styles.backgroundPreviewText}>Sample</Text>
                      </View>
                      {selectedSubtitleBackground?.id === background.id && (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color="#FFFFFF"
                          style={styles.settingsCheckmark}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}

                {/* Style Options Section */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Text Style</Text>
                </View>
                {SUBTITLE_STYLES.map((style) => (
                  <TouchableOpacity
                    key={style.id}
                    style={[
                      styles.settingsOption,
                      selectedSubtitleStyle?.id === style.id &&
                        styles.settingsOptionSelected,
                    ]}
                    onPress={() => handleStyleSelect(style)}
                  >
                    <View style={styles.styleOptionContent}>
                      <View
                        style={[
                          styles.stylePreview,
                          {
                            backgroundColor:
                              selectedSubtitleBackground?.backgroundColor ||
                              "rgba(0, 0, 0, 0.8)",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.previewText,
                            {
                              ...style.textStyle,
                              backgroundColor: "transparent",
                            },
                          ]}
                        >
                          Sample subtitle text
                        </Text>
                      </View>
                      <View style={styles.styleInfo}>
                        <Text style={styles.settingsOptionTitle}>
                          {style.name}
                        </Text>
                        <Text style={styles.settingsOptionDescription}>
                          {style.description}
                        </Text>
                      </View>
                      {selectedSubtitleStyle?.id === style.id && (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color="#FFFFFF"
                          style={styles.settingsCheckmark}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },

  // Main Controls
  scrollContainer: {
    flexGrow: 0,
    width: "100%",
  },
  scrollContent: {
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },

  captionButton: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 20,
    marginHorizontal: 4,
    minHeight: 44,
    minWidth: 60,
    paddingHorizontal: 18,
    paddingVertical: 12, // Touch target size
  },
  firstButton: {
    marginLeft: 0,
  },
  captionButtonSelected: {
    backgroundColor: Colors.dark.brandPrimary,
  },
  captionButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
  },
  captionButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  captionButtonTextSelected: {
    fontWeight: "600",
  },
  checkmark: {
    marginRight: 2,
  },
  moreButton: {
    minWidth: 70,
  },
  settingsButton: {
    minWidth: 50,
    paddingHorizontal: 12,
  },

  // Modal Styles
  modalOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "rgba(30, 30, 30, 0.98)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    alignItems: "center",
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    padding: 4,
  },
  modalScrollView: {
    paddingVertical: 8,
  },

  // Modal Options
  modalOption: {
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalOptionSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  modalOptionContent: {
    alignItems: "center",
    flexDirection: "row",
  },
  modalOptionText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "400",
  },
  modalCheckmark: {
    marginRight: 12,
  },

  // Settings Modal
  sectionHeader: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  settingsOption: {
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  settingsOptionSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  settingsOptionContent: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  settingsOptionTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  settingsOptionDescription: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12,
    lineHeight: 16,
  },
  settingsCheckmark: {
    marginLeft: 8,
  },

  // Background Preview
  backgroundInfo: {
    flex: 1,
    marginRight: 16,
  },
  backgroundPreview: {
    alignItems: "center",
    borderRadius: 6,
    marginRight: 12,
    minWidth: 80,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backgroundPreviewText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },

  // Style Preview
  styleOptionContent: {
    alignItems: "center",
    flexDirection: "column",
    position: "relative",
  },
  stylePreview: {
    alignItems: "center",
    borderRadius: 6,
    marginBottom: 12,
    minWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  previewText: {
    fontSize: 14,
    textAlign: "center",
  },
  styleInfo: {
    alignItems: "center",
    width: "100%",
  },
});

MobileCaptionControls.displayName = "MobileCaptionControls";

export default MobileCaptionControls;
