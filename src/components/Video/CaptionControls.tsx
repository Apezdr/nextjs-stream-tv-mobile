// src/components/Video/CaptionControls.tsx
import { Ionicons } from "@expo/vector-icons";
import { memo, useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Dimensions,
  TVFocusGuideView,
  ScrollView,
  Modal,
  FlatList,
  Platform,
} from "react-native";

import { Colors } from "@/src/constants/Colors";

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

interface CaptionControlsProps {
  captionURLs?: Record<string, CaptionTrack>;
  selectedCaptionLanguage?: string | undefined | null;
  onCaptionLanguageChange?: (language: string | null) => void;
  selectedSubtitleStyle?: SubtitleStyle;
  onSubtitleStyleChange?: (style: SubtitleStyle) => void;
  selectedSubtitleBackground?: SubtitleBackgroundOption;
  onSubtitleBackgroundChange?: (background: SubtitleBackgroundOption) => void;
  onActivityReset?: () => void;
  shouldAllowFocusDown?: boolean; // Whether to allow focus to move down to the next control
}

// Button data structure for FlatList
interface ButtonData {
  id: string;
  type: "caption" | "more" | "settings";
  label: string;
  language?: string | null;
  onPress: () => void;
  isSelected?: boolean;
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
  }, // DEFAULT
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

const CaptionControls = memo(
  ({
    captionURLs,
    selectedCaptionLanguage,
    onCaptionLanguageChange,
    selectedSubtitleStyle,
    onSubtitleStyleChange,
    selectedSubtitleBackground,
    onSubtitleBackgroundChange,
    onActivityReset,
    shouldAllowFocusDown = false,
  }: CaptionControlsProps) => {
    const [showMoreOptions, setShowMoreOptions] = useState(false);
    const [showStyleSettings, setShowStyleSettings] = useState(false);

    const handleCaptionLanguageSelect = useCallback(
      (language: string | null) => {
        onCaptionLanguageChange?.(language);
        setShowMoreOptions(false);
        onActivityReset?.();
      },
      [onCaptionLanguageChange, onActivityReset],
    );

    const handleStyleSelect = useCallback(
      (style: SubtitleStyle) => {
        onSubtitleStyleChange?.(style);
        onActivityReset?.();
      },
      [onSubtitleStyleChange, onActivityReset],
    );

    const handleBackgroundSelect = useCallback(
      (background: SubtitleBackgroundOption) => {
        onSubtitleBackgroundChange?.(background);
        onActivityReset?.();
      },
      [onSubtitleBackgroundChange, onActivityReset],
    );

    const toggleMoreOptions = useCallback(() => {
      setShowMoreOptions(!showMoreOptions);
      setShowStyleSettings(false);
      onActivityReset?.();
    }, [showMoreOptions, onActivityReset]);

    const toggleStyleSettings = useCallback(() => {
      setShowStyleSettings(!showStyleSettings);
      setShowMoreOptions(false);
      onActivityReset?.();
    }, [showStyleSettings, onActivityReset]);

    const availableLanguages = captionURLs ? Object.keys(captionURLs) : [];

    // Create unified button data for FlatList
    const buttonData = useMemo(() => {
      const buttons: ButtonData[] = [];

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

      // Add More button only if there are more than 2 languages (keeping original logic)
      const additionalLanguages = availableLanguages.slice(2);
      if (additionalLanguages.length > 0) {
        buttons.push({
          id: "more",
          type: "more",
          label: "More",
          onPress: toggleMoreOptions,
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
      toggleMoreOptions,
      toggleStyleSettings,
      handleCaptionLanguageSelect,
    ]);

    // Render function for FlatList items
    const renderButton = useCallback(({ item }: { item: ButtonData }) => {
      if (item.type === "caption") {
        return (
          <Pressable
            style={({ focused, pressed }) => [
              styles.captionButton,
              item.isSelected && styles.captionButtonSelected,
              focused && styles.captionButtonFocused,
              pressed && styles.captionButtonPressed,
            ]}
            onPress={item.onPress}
            isTVSelectable
            focusable={true}
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
          </Pressable>
        );
      }

      if (item.type === "more") {
        return (
          <Pressable
            style={({ focused, pressed }) => [
              styles.captionButton,
              styles.moreOptionsButton,
              focused && styles.captionButtonFocused,
              pressed && styles.captionButtonPressed,
            ]}
            onPress={item.onPress}
            focusable={true}
            isTVSelectable
          >
            <View style={styles.captionButtonContent}>
              <Text style={styles.captionButtonText}>{item.label}</Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={Colors.dark.videoControlIconColor}
              />
            </View>
          </Pressable>
        );
      }

      if (item.type === "settings") {
        return (
          <Pressable
            style={({ focused, pressed }) => [
              styles.captionButton,
              styles.settingsButton,
              focused && styles.captionButtonFocused,
              pressed && styles.captionButtonPressed,
            ]}
            onPress={item.onPress}
            focusable={true}
            isTVSelectable
          >
            <View style={styles.captionButtonContent}>
              <Ionicons
                name="settings-outline"
                size={20}
                color={Colors.dark.videoControlIconColor}
              />
            </View>
          </Pressable>
        );
      }

      return null;
    }, []);

    const keyExtractor = useCallback((item: ButtonData) => item.id, []);

    // Calculate button width for getItemLayout optimization
    const buttonDimensions = useMemo(() => {
      const baseWidth = 60; // minWidth from styles
      const margin = 12; // gap from original styles
      return { buttonWidth: baseWidth, totalWidth: baseWidth + margin };
    }, []);

    const getItemLayout = useCallback(
      (_data: ArrayLike<ButtonData> | null | undefined, index: number) => ({
        length: buttonDimensions.totalWidth,
        offset: buttonDimensions.totalWidth * index,
        index,
      }),
      [buttonDimensions.totalWidth],
    );

    // Check if More options should be shown (keeping original logic)
    const hasMoreOptions = availableLanguages.length > 2;

    const renderCaptionButton = (
      language: string | null,
      label: string,
      isInPopover = false,
    ) => {
      const isSelected = selectedCaptionLanguage === language;

      return (
        <Pressable
          key={label}
          style={({ focused, pressed }) => [
            isInPopover ? styles.popoverOption : styles.captionButton,
            isSelected &&
              (isInPopover
                ? styles.popoverOptionSelected
                : styles.captionButtonSelected),
            focused &&
              (isInPopover
                ? styles.popoverOptionFocused
                : styles.captionButtonFocused),
            pressed && styles.captionButtonPressed,
          ]}
          onPress={() => handleCaptionLanguageSelect(language)}
          isTVSelectable
          focusable={true}
        >
          <View style={styles.captionButtonContent}>
            {isSelected && (
              <Ionicons
                name="checkmark"
                size={16}
                color="#fff"
                style={
                  isInPopover
                    ? styles.checkmarkCaptionLanguages
                    : styles.checkmark
                }
              />
            )}
            <Text
              style={[
                isInPopover
                  ? styles.popoverOptionText
                  : styles.captionButtonText,
                isSelected && styles.captionButtonTextSelected,
              ]}
            >
              {label}
            </Text>
          </View>
        </Pressable>
      );
    };

    return (
      <TVFocusGuideView
        autoFocus
        trapFocusLeft
        trapFocusRight
        trapFocusDown={shouldAllowFocusDown}
      >
        <View style={styles.captionControlsContainer}>
          <View style={styles.captionControls}>
            <TVFocusGuideView
              autoFocus
              trapFocusLeft
              trapFocusRight
              trapFocusDown={shouldAllowFocusDown}
            >
              <FlatList
                data={buttonData}
                renderItem={renderButton}
                keyExtractor={keyExtractor}
                getItemLayout={getItemLayout}
                horizontal
                showsHorizontalScrollIndicator={Platform.isTV}
                decelerationRate="fast"
                scrollEventThrottle={16}
                contentContainerStyle={styles.flatListContent}
                style={styles.flatListContainer}
              />
            </TVFocusGuideView>

            {/* Modal for Caption Languages Popover */}
            <Modal
              visible={showMoreOptions && hasMoreOptions}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowMoreOptions(false)}
            >
              <TVFocusGuideView
                autoFocus
                trapFocusUp
                trapFocusDown
                trapFocusLeft
                trapFocusRight
                style={styles.modalOverlay}
              >
                <View style={styles.popoverMenu}>
                  <View style={styles.popoverHeader}>
                    <Text style={styles.popoverTitle}>Caption Languages</Text>
                    <Pressable
                      style={({ focused, pressed }) => [
                        styles.closeButton,
                        focused && styles.closeButtonFocused,
                        pressed && styles.captionButtonPressed,
                      ]}
                      onPress={() => setShowMoreOptions(false)}
                      focusable={true}
                      hasTVPreferredFocus
                      isTVSelectable
                    >
                      <Ionicons
                        name="close"
                        size={20}
                        color={Colors.dark.videoControlIconColor}
                      />
                    </Pressable>
                  </View>

                  <TVFocusGuideView autoFocus>
                    <ScrollView
                      style={styles.captionScrollView}
                      showsVerticalScrollIndicator={false}
                    >
                      {/* All Options in Popover */}
                      {renderCaptionButton(null, "Off", true)}
                      {availableLanguages.map((language) =>
                        renderCaptionButton(language, language, true),
                      )}
                    </ScrollView>
                  </TVFocusGuideView>
                </View>
              </TVFocusGuideView>
            </Modal>

            {/* Modal for Style Settings Popover */}
            <Modal
              visible={showStyleSettings}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowStyleSettings(false)}
            >
              <TVFocusGuideView
                autoFocus
                trapFocusUp
                trapFocusDown
                trapFocusLeft
                trapFocusRight
                style={styles.modalOverlay}
              >
                <View style={styles.styleSettingsMenu}>
                  <View style={styles.popoverHeader}>
                    <Text style={styles.popoverTitle}>Subtitle Settings</Text>
                    <Pressable
                      style={({ focused, pressed }) => [
                        styles.closeButton,
                        focused && styles.closeButtonFocused,
                        pressed && styles.captionButtonPressed,
                      ]}
                      onPress={() => setShowStyleSettings(false)}
                      focusable={true}
                      hasTVPreferredFocus
                      isTVSelectable
                    >
                      <Ionicons
                        name="close"
                        size={20}
                        color={Colors.dark.videoControlIconColor}
                      />
                    </Pressable>
                  </View>

                  <TVFocusGuideView autoFocus>
                    <ScrollView
                      style={styles.styleScrollView}
                      showsVerticalScrollIndicator={false}
                    >
                      {/* Background Options Section */}
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Background</Text>
                      </View>
                      {SUBTITLE_BACKGROUND_OPTIONS.map((background) => (
                        <Pressable
                          key={background.id}
                          style={({ focused, pressed }) => [
                            styles.backgroundOption,
                            selectedSubtitleBackground?.id === background.id &&
                              styles.backgroundOptionSelected,
                            focused && styles.backgroundOptionFocused,
                            pressed && styles.captionButtonPressed,
                          ]}
                          onPress={() => handleBackgroundSelect(background)}
                          focusable={true}
                          isTVSelectable
                        >
                          <View style={styles.backgroundOptionContent}>
                            <View style={styles.backgroundInfo}>
                              <Text style={styles.backgroundName}>
                                {background.name}
                              </Text>
                              <Text style={styles.backgroundDescription}>
                                {background.description}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.backgroundPreview,
                                { backgroundColor: background.backgroundColor },
                              ]}
                            >
                              <Text style={styles.backgroundPreviewText}>
                                Sample
                              </Text>
                            </View>
                            {selectedSubtitleBackground?.id ===
                              background.id && (
                              <Ionicons
                                name="checkmark"
                                size={20}
                                color={Colors.dark.videoControlIconColor}
                                style={styles.backgroundCheckmark}
                              />
                            )}
                          </View>
                        </Pressable>
                      ))}

                      {/* Style Options Section */}
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Text Style</Text>
                      </View>
                      {SUBTITLE_STYLES.map((style) => (
                        <Pressable
                          key={style.id}
                          style={({ focused, pressed }) => [
                            styles.styleOption,
                            selectedSubtitleStyle?.id === style.id &&
                              styles.styleOptionSelected,
                            focused && styles.styleOptionFocused,
                            pressed && styles.captionButtonPressed,
                          ]}
                          onPress={() => handleStyleSelect(style)}
                          focusable={true}
                          isTVSelectable
                        >
                          <View style={styles.styleOptionContent}>
                            <View
                              style={[
                                styles.stylePreview,
                                {
                                  backgroundColor:
                                    selectedSubtitleBackground?.backgroundColor ||
                                    Colors.dark.videoControlBackgroundPreviewBg,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.previewText,
                                  {
                                    ...style.textStyle,
                                    backgroundColor: Colors.dark.transparentBg,
                                  },
                                ]}
                              >
                                Sample subtitle text
                              </Text>
                            </View>
                            <View style={styles.styleInfo}>
                              <Text style={styles.styleName}>{style.name}</Text>
                              <View style={styles.styleDivider} />
                              <Text style={styles.styleDescription}>
                                {style.description}
                              </Text>
                            </View>
                            {selectedSubtitleStyle?.id === style.id && (
                              <Ionicons
                                name="checkmark"
                                size={20}
                                color={Colors.dark.videoControlIconColor}
                                style={styles.styleCheckmark}
                              />
                            )}
                          </View>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </TVFocusGuideView>
                </View>
              </TVFocusGuideView>
            </Modal>
          </View>
        </View>
      </TVFocusGuideView>
    );
  },
);

const styles = StyleSheet.create({
  // Background Settings Styles
  backgroundCheckmark: {
    marginLeft: 8,
  },

  backgroundDescription: {
    color: Colors.dark.videoControlSecondaryTextColor,
    fontSize: 12,
    lineHeight: 16,
  },

  backgroundInfo: {
    flex: 1,
    marginRight: 16,
  },

  backgroundName: {
    color: Colors.dark.whiteText,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },

  backgroundOption: {
    borderBottomColor: Colors.dark.videoControlOptionBorder,
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },

  backgroundOptionContent: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },

  backgroundOptionFocused: {
    backgroundColor: Colors.dark.videoControlOptionFocusedBg,
  },

  backgroundOptionSelected: {
    backgroundColor: Colors.dark.videoControlOptionSelectedBg,
  },

  backgroundPreview: {
    alignItems: "center",
    backgroundColor: Colors.dark.videoControlBackgroundPreviewBg,
    borderRadius: 6,
    marginRight: 12,
    minWidth: 80,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  backgroundPreviewText: {
    color: Colors.dark.whiteText,
    fontSize: 12,
    fontWeight: "500",
  },

  captionButton: {
    backgroundColor: Colors.dark.videoControlCaptionButtonBg,
    borderColor: Colors.dark.transparentBorder,
    borderRadius: 8,
    borderWidth: 2,
    minWidth: 60,
    marginHorizontal: 6, // Half of the original gap: 12
    paddingHorizontal: 18,
    paddingLeft: 24,
    paddingVertical: 8,
  },

  captionButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
  },

  captionButtonFocused: {
    backgroundColor: Colors.dark.videoControlButtonFocusedBg,
    borderColor: Colors.dark.videoControlButtonFocusedBorder,
  },

  captionButtonPressed: {
    backgroundColor: Colors.dark.videoControlButtonPressedBg,
  },

  captionButtonSelected: {
    backgroundColor: Colors.dark.videoControlButtonSelectedBg,
  },

  captionButtonText: {
    color: Colors.dark.whiteText,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },

  captionButtonTextSelected: {
    fontWeight: "600",
  },

  captionControls: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },

  captionControlsContainer: {
    alignItems: "center",
    bottom: 20,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
  },

  captionScrollView: {
    maxHeight: Dimensions.get("window").height * 0.5,
    paddingVertical: 8,
  },

  checkmark: {
    position: "absolute",
    right: "105%",
  },

  checkmarkCaptionLanguages: {
    position: "absolute",
    right: "94%",
  },

  closeButton: {
    backgroundColor: Colors.dark.transparentBg,
    borderRadius: 6,
    padding: 4,
  },

  closeButtonFocused: {
    backgroundColor: Colors.dark.videoControlButtonFocusedBg,
  },

  // Modal Overlay
  modalOverlay: {
    alignItems: "flex-end",
    backgroundColor: Colors.dark.videoControlModalOverlayBg,
    flex: 1,
    justifyContent: "center",
    paddingRight: 20,
  },

  moreOptionsButton: {
    minWidth: 70,
  },

  popoverHeader: {
    alignItems: "center",
    borderBottomColor: Colors.dark.videoControlPopoverHeaderBorder,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },

  // Popover Styles
  popoverMenu: {
    backgroundColor: Colors.dark.videoControlPopoverMenuBg,
    borderColor: Colors.dark.videoControlPopoverBorder,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 20,
    maxHeight: Dimensions.get("window").height * 0.7,
    shadowColor: Colors.dark.videoControlPopoverShadow,
    shadowOffset: { width: -2, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    width: 300,
  },

  popoverOption: {
    backgroundColor: Colors.dark.transparentBg,
    borderRadius: 0,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },

  popoverOptionFocused: {
    backgroundColor: Colors.dark.videoControlOptionFocusedBg,
  },

  popoverOptionSelected: {
    backgroundColor: Colors.dark.videoControlOptionSelectedBg,
  },

  popoverOptionText: {
    color: Colors.dark.whiteText,
    fontSize: 14,
    fontWeight: "400",
  },

  popoverTitle: {
    color: Colors.dark.videoControlPopoverTitle,
    fontSize: 16,
    fontWeight: "600",
  },

  previewText: {
    fontSize: 12,
    textAlign: "center",
  },

  // FlatList styles
  flatListContainer: {
    flexGrow: 0,
  },

  flatListContent: {
    paddingHorizontal: 6, // Half of the original gap for padding
  },

  // Section Header Styles
  sectionHeader: {
    backgroundColor: Colors.dark.videoControlSectionHeaderBg,
    borderBottomColor: Colors.dark.videoControlSectionHeaderBorder,
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },

  sectionTitle: {
    color: Colors.dark.whiteText,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  settingsButton: {
    minWidth: 50,
  },

  styleCheckmark: {
    position: "absolute",
    right: 8,
    top: 8,
  },

  styleDescription: {
    color: Colors.dark.videoControlSecondaryTextColor,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },

  styleDivider: {
    backgroundColor: Colors.dark.whiteBg,
    height: 2,
    marginBottom: 4,
    width: "100%",
  },

  styleInfo: {
    alignItems: "center",
    marginTop: 12,
    width: "100%",
  },

  styleName: {
    color: Colors.dark.whiteText,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
    textAlign: "center",
  },

  styleOption: {
    borderBottomColor: Colors.dark.videoControlOptionBorder,
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },

  styleOptionContent: {
    alignItems: "center",
    flexDirection: "column",
    justifyContent: "center",
    position: "relative",
  },

  styleOptionFocused: {
    backgroundColor: Colors.dark.videoControlOptionFocusedBg,
  },

  styleOptionSelected: {
    backgroundColor: Colors.dark.videoControlOptionSelectedBg,
  },

  stylePreview: {
    alignItems: "center",
    borderRadius: 6,
    marginBottom: 8,
    minWidth: 200,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  styleScrollView: {
    maxHeight: Dimensions.get("window").height * 0.6,
  },

  // Style Settings Styles
  styleSettingsMenu: {
    backgroundColor: Colors.dark.videoControlPopoverMenuBg,
    borderColor: Colors.dark.videoControlPopoverBorder,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 20,
    maxHeight: Dimensions.get("window").height * 0.8,
    shadowColor: Colors.dark.videoControlPopoverShadow,
    shadowOffset: { width: -2, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    width: 400,
  },
});

CaptionControls.displayName = "CaptionControls";

export default CaptionControls;
