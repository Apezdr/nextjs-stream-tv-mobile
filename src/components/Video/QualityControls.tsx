// src/components/Video/QualityControls.tsx
//
// TV quality-tier flyout, a structural sibling of AudioControls: focusable
// trigger button + right-anchored modal listing the delivery tiers from
// resolveAvailableTiers. Selecting a tier is remembered per title upstream
// (implicit remember-last-choice); an unavailable Original renders disabled
// with the server's withhold reason as subtext.
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useState } from "react";
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
import { useDimensions } from "@/src/hooks/useDimensions";
import { QualityTierId, QualityTierOption } from "@/src/utils/qualityTiers";

interface QualityControlsProps {
  tiers: QualityTierOption[];
  activeTier: QualityTierId;
  onSelectTier: (tier: QualityTierId) => void;
  isSwitching?: boolean;
  // True after an automatic §8 descent — the menu explains why the active
  // tier is not what the user picked.
  hasDescended?: boolean;
  onActivityReset?: () => void;
  // Forwarded to the wrapping TVFocusGuideView, same semantics as
  // AudioControls: trap DOWN when nothing focusable sits below.
  trapFocusDown?: boolean;
  // False when another button renders to the left so focus can flow across.
  trapFocusLeft?: boolean;
}

const QualityControls = memo(
  ({
    tiers,
    activeTier,
    onSelectTier,
    isSwitching = false,
    hasDescended = false,
    onActivityReset,
    trapFocusDown = true,
    trapFocusLeft = true,
  }: QualityControlsProps) => {
    const [showFlyout, setShowFlyout] = useState(false);
    const { window } = useDimensions();

    const openFlyout = useCallback(() => {
      setShowFlyout(true);
      onActivityReset?.();
    }, [onActivityReset]);

    const handleSelect = useCallback(
      (tier: QualityTierOption) => {
        if (!tier.unavailableReason && !isSwitching) {
          onSelectTier(tier.id);
        }
        setShowFlyout(false);
        onActivityReset?.();
      },
      [isSwitching, onSelectTier, onActivityReset],
    );

    return (
      <TVFocusGuideView
        autoFocus
        trapFocusRight
        trapFocusLeft={trapFocusLeft}
        trapFocusDown={trapFocusDown}
      >
        <Pressable
          style={({ focused, pressed }) => [
            styles.qualityButton,
            focused && styles.qualityButtonFocused,
            pressed && styles.qualityButtonPressed,
          ]}
          onPress={openFlyout}
          focusable={true}
          isTVSelectable
        >
          <View style={styles.qualityButtonContent}>
            <Ionicons
              name="options"
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

        {/* Modal for Quality Popover */}
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
                <Text style={styles.popoverTitle}>Quality</Text>
                <Pressable
                  style={({ focused, pressed }) => [
                    styles.closeButton,
                    focused && styles.closeButtonFocused,
                    pressed && styles.qualityButtonPressed,
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
                    styles.qualityScrollView,
                    { maxHeight: window.height * 0.5 },
                  ]}
                  showsVerticalScrollIndicator={false}
                >
                  {tiers.map((tier) => {
                    const unavailable = !!tier.unavailableReason;
                    const isSelected = tier.id === activeTier && !unavailable;
                    return (
                      <Pressable
                        key={tier.id}
                        style={({ focused, pressed }) => [
                          styles.popoverOption,
                          isSelected && styles.popoverOptionSelected,
                          focused && styles.popoverOptionFocused,
                          pressed && styles.qualityButtonPressed,
                        ]}
                        onPress={() => handleSelect(tier)}
                        isTVSelectable={!unavailable}
                        focusable={!unavailable}
                        disabled={unavailable}
                      >
                        <View style={styles.qualityButtonContent}>
                          {isSelected && (
                            <Ionicons
                              name="checkmark"
                              size={16}
                              color="#fff"
                              style={styles.checkmark}
                            />
                          )}
                          <View style={styles.optionTextColumn}>
                            <Text
                              style={[
                                styles.popoverOptionText,
                                isSelected && styles.popoverOptionTextSelected,
                                unavailable &&
                                  styles.popoverOptionTextUnavailable,
                              ]}
                            >
                              {tier.label}
                            </Text>
                            {unavailable && (
                              <Text style={styles.optionSubtext}>
                                {tier.unavailableReason}
                              </Text>
                            )}
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                  {hasDescended && (
                    <Text style={styles.descentNote}>
                      Quality was reduced after a playback error.
                    </Text>
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
  checkmark: {
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

  descentNote: {
    color: Colors.dark.videoControlSecondaryTextColor,
    fontSize: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },

  modalOverlay: {
    alignItems: "flex-end",
    backgroundColor: Colors.dark.videoControlModalOverlayBg,
    flex: 1,
    justifyContent: "center",
    paddingRight: 20,
  },

  optionSubtext: {
    color: Colors.dark.videoControlSecondaryTextColor,
    fontSize: 12,
    marginTop: 4,
  },

  optionTextColumn: {
    flexShrink: 1,
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
    width: 340,
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

  popoverOptionTextSelected: {
    fontWeight: "600",
  },

  popoverOptionTextUnavailable: {
    color: Colors.dark.videoControlSecondaryTextColor,
  },

  popoverTitle: {
    color: Colors.dark.videoControlPopoverTitle,
    fontSize: 16,
    fontWeight: "600",
  },

  qualityButton: {
    backgroundColor: Colors.dark.videoControlCaptionButtonBg,
    borderColor: Colors.dark.transparentBorder,
    borderRadius: 8,
    borderWidth: 2,
    marginHorizontal: 6,
    minWidth: 70,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },

  qualityButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
  },

  qualityButtonFocused: {
    backgroundColor: Colors.dark.videoControlButtonFocusedBg,
    borderColor: Colors.dark.videoControlButtonFocusedBorder,
  },

  qualityButtonPressed: {
    backgroundColor: Colors.dark.videoControlButtonPressedBg,
  },

  qualityScrollView: {
    paddingVertical: 8,
  },
});

QualityControls.displayName = "QualityControls";

export default QualityControls;
