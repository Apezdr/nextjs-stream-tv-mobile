// src/components/Video/AudioControls.tsx
import { Ionicons } from "@expo/vector-icons";
import type { AudioTrack } from "expo-video";
import { memo, useCallback, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  TVFocusGuideView,
  ScrollView,
  Modal,
} from "react-native";

import { Colors } from "@/src/constants/Colors";
import { AudioFormatOption } from "@/src/hooks/useAudioFormats";
import {
  AudioLanguageOption,
  audioTrackKey,
  audioTracksEqual,
  effectiveAudioLanguage,
  groupAudioTracksByLanguage,
} from "@/src/hooks/useAudioTracks";
import { useDimensions } from "@/src/hooks/useDimensions";

interface AudioControlsProps {
  audioTracks: AudioTrack[];
  selectedAudioTrack: AudioTrack | null;
  onAudioTrackChange: (track: AudioTrack) => void;
  // Sound-format renditions of the active language (Android-only in
  // practice; empty elsewhere).
  formatOptions?: AudioFormatOption[];
  selectedFormatGroupId?: string | null;
  // True while the player is choosing the track itself.
  isAutoFormat?: boolean;
  // Whether this runtime can return to automatic selection.
  canSelectAuto?: boolean;
  onSelectAuto?: () => void;
  onActivityReset?: () => void;
  // Forwarded to the wrapping TVFocusGuideView, same semantics as
  // CaptionControls: trap DOWN when nothing focusable sits below.
  trapFocusDown?: boolean;
  // False when the caption row renders to the left of this button so focus
  // can flow between the two.
  trapFocusLeft?: boolean;
  // False when another button (quality) renders to the right of this one.
  trapFocusRight?: boolean;
}

// A single flyout button mirroring the captions "More" pattern: audio icon +
// chevron, opening a right-anchored modal listing the stream's audio
// languages. Deliberately a sibling of CaptionControls rather than an
// extension — captions may not render at all while audio tracks must.
const AudioControls = memo(
  ({
    audioTracks,
    selectedAudioTrack,
    onAudioTrackChange,
    formatOptions = [],
    selectedFormatGroupId = null,
    isAutoFormat = false,
    canSelectAuto = false,
    onSelectAuto,
    onActivityReset,
    trapFocusDown = true,
    trapFocusLeft = true,
    trapFocusRight = true,
  }: AudioControlsProps) => {
    const [showFlyout, setShowFlyout] = useState(false);

    // Get dynamic dimensions
    const { window } = useDimensions();

    const openFlyout = useCallback(() => {
      setShowFlyout(true);
      onActivityReset?.();
    }, [onActivityReset]);

    // One row per distinct language — codec/channel renditions of the same
    // language collapse into a single option.
    const languageOptions = useMemo(
      () => groupAudioTracksByLanguage(audioTracks),
      [audioTracks],
    );

    // Must go through effectiveAudioLanguage: player.audioTrack is null while
    // the player is on automatic selection, so reading its language directly
    // marks every row unselected — which both hides the checkmark and defeats
    // the no-op guard below, letting a tap on the already-playing language
    // reassign the representative track and silently drop 5.1 to stereo.
    const selectedLanguage = effectiveAudioLanguage(
      selectedAudioTrack,
      audioTracks,
    );

    const isOptionSelected = useCallback(
      (option: AudioLanguageOption) =>
        option.language
          ? option.language === selectedLanguage
          : audioTracksEqual(option.track, selectedAudioTrack),
      [selectedLanguage, selectedAudioTrack],
    );

    const handleOptionSelect = useCallback(
      (option: AudioLanguageOption) => {
        // Re-selecting the active language is a no-op: assigning the
        // representative track would force a specific rendition of a language
        // that's already playing.
        if (!isOptionSelected(option)) {
          onAudioTrackChange(option.track);
        }
        setShowFlyout(false);
        onActivityReset?.();
      },
      [isOptionSelected, onAudioTrackChange, onActivityReset],
    );

    const handleFormatSelect = useCallback(
      (option: AudioFormatOption) => {
        if (option.groupId !== selectedFormatGroupId) {
          onAudioTrackChange(option.track);
        }
        setShowFlyout(false);
        onActivityReset?.();
      },
      [selectedFormatGroupId, onAudioTrackChange, onActivityReset],
    );

    const handleAutoSelect = useCallback(() => {
      if (!isAutoFormat) onSelectAuto?.();
      setShowFlyout(false);
      onActivityReset?.();
    }, [isAutoFormat, onSelectAuto, onActivityReset]);

    const languageSectionVisible = languageOptions.length >= 2;
    const formatSectionVisible = formatOptions.length >= 2;
    // Headers only earn their space when both axes are shown.
    const showSectionHeaders = languageSectionVisible && formatSectionVisible;

    const renderOptionRow = (
      key: string,
      label: string,
      isSelected: boolean,
      onPress: () => void,
      isUnsupported = false,
      // Dimmed when the row is only ticked because automatic selection landed
      // on it, rather than because the user chose it. Keeps "Auto" readable as
      // the active mode while still showing what Auto resolved to.
      isImplied = false,
    ) => (
      <Pressable
        key={key}
        style={({ focused, pressed }) => [
          styles.popoverOption,
          isSelected && !isImplied && styles.popoverOptionSelected,
          isSelected && isImplied && styles.popoverOptionImplied,
          focused && styles.popoverOptionFocused,
          pressed && styles.audioButtonPressed,
        ]}
        onPress={onPress}
        isTVSelectable={!isUnsupported}
        focusable={!isUnsupported}
        disabled={isUnsupported}
      >
        <View
          style={[
            styles.audioButtonContent,
            isSelected && isImplied && styles.impliedContent,
          ]}
        >
          {isSelected && (
            <Ionicons
              name="checkmark"
              size={16}
              color="#fff"
              style={styles.checkmarkAudioLanguages}
            />
          )}
          <Text
            style={[
              styles.popoverOptionText,
              isSelected && styles.popoverOptionTextSelected,
              isUnsupported && styles.popoverOptionTextUnsupported,
            ]}
          >
            {isUnsupported ? `${label} (unsupported)` : label}
          </Text>
        </View>
      </Pressable>
    );

    return (
      <TVFocusGuideView
        autoFocus
        trapFocusRight={trapFocusRight}
        trapFocusLeft={trapFocusLeft}
        trapFocusDown={trapFocusDown}
      >
        <Pressable
          style={({ focused, pressed }) => [
            styles.audioButton,
            focused && styles.audioButtonFocused,
            pressed && styles.audioButtonPressed,
          ]}
          onPress={openFlyout}
          focusable={true}
          isTVSelectable
        >
          <View style={styles.audioButtonContent}>
            <Ionicons
              name="volume-high"
              size={20}
              color={Colors.dark.videoControlIconColor}
            />
            <Ionicons
              name="chevron-forward"
              size={16}
              color={Colors.dark.videoControlIconColor}
            />
          </View>
        </Pressable>

        {/* Modal for Audio Languages Popover */}
        <Modal
          visible={showFlyout}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowFlyout(false)}
        >
          <TVFocusGuideView
            autoFocus
            trapFocusUp
            trapFocusDown
            trapFocusLeft
            trapFocusRight
            style={styles.modalOverlay}
          >
            <View
              style={[styles.popoverMenu, { maxHeight: window.height * 0.7 }]}
            >
              <View style={styles.popoverHeader}>
                <Text style={styles.popoverTitle}>Audio</Text>
                <Pressable
                  style={({ focused, pressed }) => [
                    styles.closeButton,
                    focused && styles.closeButtonFocused,
                    pressed && styles.audioButtonPressed,
                  ]}
                  onPress={() => setShowFlyout(false)}
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
                  style={[
                    styles.audioScrollView,
                    { maxHeight: window.height * 0.5 },
                  ]}
                  showsVerticalScrollIndicator={false}
                >
                  {languageSectionVisible && (
                    <>
                      {showSectionHeaders && (
                        <View style={styles.sectionHeader}>
                          <Text style={styles.sectionTitle}>Language</Text>
                        </View>
                      )}
                      {languageOptions.map((option) =>
                        renderOptionRow(
                          option.language || audioTrackKey(option.track),
                          option.label,
                          isOptionSelected(option),
                          () => handleOptionSelect(option),
                        ),
                      )}
                    </>
                  )}
                  {formatSectionVisible && (
                    <>
                      {showSectionHeaders && (
                        <View style={styles.sectionHeader}>
                          <Text style={styles.sectionTitle}>Sound Format</Text>
                        </View>
                      )}
                      {/* Automatic selection lands on the best format the
                          device can actually decode, so it stays offered as a
                          real choice — but only where the runtime can return
                          to it. On runtimes without that support the row is
                          shown only while it is already active, since the
                          only other lever (a null track) mutes the player. */}
                      {(canSelectAuto || isAutoFormat) &&
                        renderOptionRow(
                          "format:auto",
                          "Auto",
                          isAutoFormat,
                          handleAutoSelect,
                        )}
                      {formatOptions.map((option) =>
                        renderOptionRow(
                          `format:${option.groupId}`,
                          option.label,
                          option.groupId === selectedFormatGroupId,
                          () => handleFormatSelect(option),
                          !option.isSupported,
                          // While on Auto, the ticked format is what the
                          // player resolved to, not a user choice — dim it so
                          // "Auto" reads as the active mode.
                          isAutoFormat,
                        ),
                      )}
                    </>
                  )}
                </ScrollView>
              </TVFocusGuideView>
            </View>
          </TVFocusGuideView>
        </Modal>
      </TVFocusGuideView>
    );
  },
);

const styles = StyleSheet.create({
  audioButton: {
    backgroundColor: Colors.dark.videoControlCaptionButtonBg,
    borderColor: Colors.dark.transparentBorder,
    borderRadius: 8,
    borderWidth: 2,
    marginHorizontal: 6,
    minWidth: 70,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },

  audioButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
  },

  audioButtonFocused: {
    backgroundColor: Colors.dark.videoControlButtonFocusedBg,
    borderColor: Colors.dark.videoControlButtonFocusedBorder,
  },

  audioButtonPressed: {
    backgroundColor: Colors.dark.videoControlButtonPressedBg,
  },

  audioScrollView: {
    paddingVertical: 8,
  },

  checkmarkAudioLanguages: {
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

  modalOverlay: {
    alignItems: "flex-end",
    backgroundColor: Colors.dark.videoControlModalOverlayBg,
    flex: 1,
    justifyContent: "center",
    paddingRight: 20,
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

  popoverMenu: {
    backgroundColor: Colors.dark.videoControlPopoverMenuBg,
    borderColor: Colors.dark.videoControlPopoverBorder,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 20,
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

  // Same highlight as a real selection, softened, for the format Auto
  // resolved to.
  popoverOptionImplied: {
    backgroundColor: Colors.dark.videoControlOptionSelectedBg,
    opacity: 0.55,
  },

  impliedContent: {
    opacity: 0.75,
  },

  popoverOptionText: {
    color: Colors.dark.whiteText,
    fontSize: 14,
    fontWeight: "400",
  },

  popoverOptionTextSelected: {
    fontWeight: "600",
  },

  popoverOptionTextUnsupported: {
    color: Colors.dark.videoControlSecondaryTextColor,
  },

  popoverTitle: {
    color: Colors.dark.videoControlPopoverTitle,
    fontSize: 16,
    fontWeight: "600",
  },

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
});

AudioControls.displayName = "AudioControls";

export default AudioControls;
