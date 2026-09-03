// src/components/Mobile/Video/MobileAudioControls.tsx
import { Ionicons } from "@expo/vector-icons";
import type { AudioTrack } from "expo-video";
import { memo, useCallback, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
} from "react-native";

import { AudioFormatOption } from "@/src/hooks/useAudioFormats";
import {
  effectiveAudioTrack,
  isDescriptiveAudioTrack,
  AudioLanguageOption,
  audioTracksEqual,
  effectiveAudioLanguage,
  groupAudioTracksByLanguage,
} from "@/src/hooks/useAudioTracks";
import { useDimensions } from "@/src/hooks/useDimensions";

interface MobileAudioControlsProps {
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
  onShowControls?: () => void; // Mobile-specific: show controls when user interacts
}

// A single button mirroring the captions "More" pattern: audio icon +
// chevron, opening a bottom-sheet modal listing the stream's audio languages.
const MobileAudioControls = memo(
  ({
    audioTracks,
    selectedAudioTrack,
    onAudioTrackChange,
    formatOptions = [],
    selectedFormatGroupId = null,
    isAutoFormat = false,
    canSelectAuto = false,
    onSelectAuto,
    onShowControls,
  }: MobileAudioControlsProps) => {
    const [showLanguages, setShowLanguages] = useState(false);

    // Get dynamic dimensions that will update with orientation changes
    const { window } = useDimensions();
    const screenHeight = window.height;

    const openLanguages = useCallback(() => {
      setShowLanguages(true);
      onShowControls?.();
    }, [onShowControls]);

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

    // Whether what is playing is a commentary / audio-description track, so
    // the language row and its commentary row never tick together.
    const selectedIsDescriptive = isDescriptiveAudioTrack(
      effectiveAudioTrack(selectedAudioTrack, audioTracks),
    );

    const isOptionSelected = useCallback(
      (option: AudioLanguageOption) => {
        if (!option.language) {
          return audioTracksEqual(option.track, selectedAudioTrack);
        }
        if (option.language !== selectedLanguage) return false;
        return option.descriptive === selectedIsDescriptive;
      },
      [selectedLanguage, selectedAudioTrack, selectedIsDescriptive],
    );

    const handleOptionSelect = useCallback(
      (option: AudioLanguageOption) => {
        // Re-selecting the active language is a no-op: assigning the
        // representative track would force a specific rendition of a language
        // that's already playing.
        if (!isOptionSelected(option)) {
          onAudioTrackChange(option.track);
        }
        setShowLanguages(false);
        onShowControls?.();
      },
      [isOptionSelected, onAudioTrackChange, onShowControls],
    );

    const handleFormatSelect = useCallback(
      (option: AudioFormatOption) => {
        if (option.groupId !== selectedFormatGroupId) {
          onAudioTrackChange(option.track);
        }
        setShowLanguages(false);
        onShowControls?.();
      },
      [selectedFormatGroupId, onAudioTrackChange, onShowControls],
    );

    const handleAutoSelect = useCallback(() => {
      if (!isAutoFormat) onSelectAuto?.();
      setShowLanguages(false);
      onShowControls?.();
    }, [isAutoFormat, onSelectAuto, onShowControls]);

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
      <TouchableOpacity
        key={key}
        style={[
          styles.modalOption,
          isSelected && !isImplied && styles.modalOptionSelected,
          isSelected && isImplied && styles.modalOptionImplied,
        ]}
        onPress={onPress}
        disabled={isUnsupported}
      >
        <View
          style={[
            styles.modalOptionContent,
            isSelected && isImplied && styles.impliedContent,
          ]}
        >
          {isSelected && (
            <Ionicons
              name="checkmark"
              size={20}
              color="#FFFFFF"
              style={styles.modalCheckmark}
            />
          )}
          <Text
            style={[
              styles.modalOptionText,
              isUnsupported && styles.modalOptionTextUnsupported,
            ]}
          >
            {isUnsupported ? `${label} (unsupported)` : label}
          </Text>
        </View>
      </TouchableOpacity>
    );

    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.audioButton}
          onPress={openLanguages}
          activeOpacity={0.7}
        >
          <View style={styles.audioButtonContent}>
            <Ionicons name="volume-high" size={20} color="#FFFFFF" />
            <Ionicons
              name="chevron-forward"
              size={16}
              color="rgba(255, 255, 255, 0.7)"
            />
          </View>
        </TouchableOpacity>

        {/* Audio Languages Modal */}
        <Modal
          visible={showLanguages}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowLanguages(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowLanguages(false)}
          >
            <View
              style={[styles.modalContent, { maxHeight: screenHeight * 0.7 }]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Audio</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setShowLanguages(false)}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollView}>
                {languageSectionVisible && (
                  <>
                    {showSectionHeaders && (
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Language</Text>
                      </View>
                    )}
                    {languageOptions.map((option) =>
                      renderOptionRow(
                        option.key,
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
                        real choice — but only where the runtime can return to
                        it. On runtimes without that support the row is shown
                        only while it is already active, since the only other
                        lever (a null track) mutes the player. */}
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
                        // While on Auto, the ticked format is what the player
                        // resolved to, not a user choice — dim it so "Auto"
                        // reads as the active mode.
                        isAutoFormat,
                      ),
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  audioButton: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 20,
    marginHorizontal: 4,
    minHeight: 44,
    minWidth: 60,
    paddingHorizontal: 18,
    paddingVertical: 12, // Touch target size
  },
  audioButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
  },
  closeButton: {
    padding: 4,
  },
  container: {
    marginTop: 16,
  },
  modalCheckmark: {
    marginRight: 12,
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
  modalOption: {
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalOptionContent: {
    alignItems: "center",
    flexDirection: "row",
  },
  modalOptionSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  // Same highlight as a real selection, softened, for the format Auto
  // resolved to.
  modalOptionImplied: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  impliedContent: {
    opacity: 0.6,
  },
  modalOptionText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "400",
  },
  modalOptionTextUnsupported: {
    color: "rgba(255, 255, 255, 0.4)",
  },
  modalOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modalScrollView: {
    paddingVertical: 8,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
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
});

MobileAudioControls.displayName = "MobileAudioControls";

export default MobileAudioControls;
