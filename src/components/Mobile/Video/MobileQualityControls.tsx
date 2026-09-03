// src/components/Mobile/Video/MobileQualityControls.tsx
//
// Mobile quality-tier picker, a structural sibling of MobileAudioControls:
// touch button + bottom-sheet modal listing the delivery tiers. Selection is
// remembered per title upstream (implicit remember-last-choice).
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
} from "react-native";

import { useDimensions } from "@/src/hooks/useDimensions";
import { QualityTierId, QualityTierOption } from "@/src/utils/qualityTiers";

interface MobileQualityControlsProps {
  tiers: QualityTierOption[];
  activeTier: QualityTierId;
  onSelectTier: (tier: QualityTierId) => void;
  isSwitching?: boolean;
  // True after an automatic §8 descent — the menu explains why the active
  // tier is not what the user picked.
  hasDescended?: boolean;
  onShowControls?: () => void; // Mobile-specific: show controls when user interacts
}

const MobileQualityControls = memo(
  ({
    tiers,
    activeTier,
    onSelectTier,
    isSwitching = false,
    hasDescended = false,
    onShowControls,
  }: MobileQualityControlsProps) => {
    const [showTiers, setShowTiers] = useState(false);
    const { window } = useDimensions();
    const screenHeight = window.height;

    const openTiers = useCallback(() => {
      setShowTiers(true);
      onShowControls?.();
    }, [onShowControls]);

    const handleSelect = useCallback(
      (tier: QualityTierOption) => {
        if (!tier.unavailableReason && !isSwitching) {
          onSelectTier(tier.id);
        }
        setShowTiers(false);
        onShowControls?.();
      },
      [isSwitching, onSelectTier, onShowControls],
    );

    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.qualityButton}
          onPress={openTiers}
          activeOpacity={0.7}
        >
          <View style={styles.qualityButtonContent}>
            <Ionicons name="options" size={20} color="#FFFFFF" />
            <Ionicons
              name="chevron-forward"
              size={16}
              color="rgba(255, 255, 255, 0.7)"
            />
          </View>
        </TouchableOpacity>

        {/* Quality Tiers Modal */}
        <Modal
          visible={showTiers}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowTiers(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowTiers(false)}
          >
            <View
              style={[styles.modalContent, { maxHeight: screenHeight * 0.7 }]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Quality</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setShowTiers(false)}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollView}>
                {tiers.map((tier) => {
                  const unavailable = !!tier.unavailableReason;
                  const isSelected = tier.id === activeTier && !unavailable;
                  return (
                    <TouchableOpacity
                      key={tier.id}
                      style={[
                        styles.modalOption,
                        isSelected && styles.modalOptionSelected,
                      ]}
                      onPress={() => handleSelect(tier)}
                      disabled={unavailable}
                    >
                      <View style={styles.modalOptionContent}>
                        {isSelected && (
                          <Ionicons
                            name="checkmark"
                            size={20}
                            color="#FFFFFF"
                            style={styles.modalCheckmark}
                          />
                        )}
                        <View style={styles.optionTextColumn}>
                          <Text
                            style={[
                              styles.modalOptionText,
                              unavailable && styles.modalOptionTextUnavailable,
                            ]}
                          >
                            {tier.label}
                          </Text>
                          {(unavailable || tier.description) && (
                            <Text style={styles.optionSubtext}>
                              {unavailable
                                ? tier.unavailableReason
                                : tier.description}
                            </Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {hasDescended && (
                  <Text style={styles.descentNote}>
                    Quality was reduced after a playback error.
                  </Text>
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
  closeButton: {
    padding: 4,
  },
  container: {
    marginTop: 16,
  },
  descentNote: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
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
  modalOptionText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "400",
  },
  modalOptionTextUnavailable: {
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
  optionSubtext: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 13,
    marginTop: 4,
  },
  optionTextColumn: {
    flexShrink: 1,
  },
  qualityButton: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 20,
    marginHorizontal: 4,
    minHeight: 44,
    minWidth: 60,
    paddingHorizontal: 18,
    paddingVertical: 12, // Touch target size
  },
  qualityButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
  },
});

MobileQualityControls.displayName = "MobileQualityControls";

export default MobileQualityControls;
