import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Modal,
  Platform,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { usePortal } from "@/src/components/common/Portal";
import { Colors } from "@/src/constants/Colors";
import { useDimensions } from "@/src/hooks/useDimensions";

export interface ActionSheetAction {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: "default" | "primary" | "destructive";
}

interface MobileActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  actions: ActionSheetAction[];
  backdropDismiss?: boolean;
}

const MobileActionSheet: React.FC<MobileActionSheetProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  actions,
  backdropDismiss = true,
}) => {
  const insets = useSafeAreaInsets();
  const { addPortal, removePortal } = usePortal();

  // Get dynamic dimensions that will update with orientation changes
  const { window, screen } = useDimensions();
  const screenHeight = window.height;
  const fullScreenHeight = screen.height;

  // Calculate status bar height for full screen coverage like MobileBanner
  const statusBarHeight = fullScreenHeight - screenHeight;

  // Calculate sheet height dynamically
  const headerHeight = title || subtitle ? 60 : 20;
  const actionHeight = 56;
  const sheetHeight =
    headerHeight + actions.length * actionHeight + insets.bottom + 50;

  // Reanimated shared values - start hidden
  const translateY = useSharedValue(sheetHeight); // Start off-screen
  const backdropOpacity = useSharedValue(0);
  const panTranslateY = useSharedValue(0);
  const sheetOpacity = useSharedValue(0); // Keep entire sheet invisible until animation starts

  // Track component mount state and icon rendering
  const isMountedRef = useRef(true);
  const [shouldRenderIcons, setShouldRenderIcons] = useState(false);
  const portalKey = useRef(
    `action-sheet-${Math.random().toString(36).substr(2, 9)}`,
  ).current;

  // Gesture for swipe-to-dismiss
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        panTranslateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 150 || event.velocityY > 500) {
        // Dismiss
        scheduleOnRN(removePortal, portalKey);
        scheduleOnRN(onClose);
      } else {
        // Snap back
        panTranslateY.value = withSpring(0);
      }
    });

  const showSheet = useCallback(() => {
    if (!isMountedRef.current) return;
    panTranslateY.value = 0;

    // Make sheet visible immediately, then animate
    sheetOpacity.value = 1;

    translateY.value = withSpring(0, {
      damping: 120,
      stiffness: 900,
      overshootClamping: false,
      energyThreshold: 6e-9,
    });
    backdropOpacity.value = withTiming(1, { duration: 300 });

    // Delay icon rendering to prevent flash during portal mount
    const timeout = setTimeout(() => {
      if (!isMountedRef.current) return;
      setShouldRenderIcons(true);
    }, 90);
    return () => {
      clearTimeout(timeout);
    };
  }, []);

  const hideSheet = useCallback(
    (callback?: () => void) => {
      if (!isMountedRef.current) return;
      translateY.value = withSpring(sheetHeight, {
        damping: 15,
        stiffness: 200,
      });
      backdropOpacity.value = withTiming(0, { duration: 250 }, (finished) => {
        if (finished && callback) {
          scheduleOnRN(callback);
        }
      });
    },
    [sheetHeight],
  );

  const handleClose = useCallback(() => {
    hideSheet(() => {
      if (isMountedRef.current) {
        onClose();
      }
    });
  }, [hideSheet, onClose]);

  const handleBackdropPress = useCallback(() => {
    if (backdropDismiss) {
      handleClose();
    }
  }, [backdropDismiss, handleClose]);

  const handleActionPress = useCallback(
    (action: ActionSheetAction) => {
      if (!isMountedRef.current) return;

      // Immediately close the action sheet and remove from portal
      // to prevent back button interference during navigation
      removePortal(portalKey);
      onClose();

      // Execute action immediately without waiting for animation
      action.onPress();
    },
    [removePortal, portalKey, onClose],
  );

  // Component lifecycle
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Show/hide animations with proper cleanup
  useEffect(() => {
    if (!isMountedRef.current) return;

    if (visible) {
      showSheet();
    } else {
      // Reset to hidden state immediately
      translateY.value = sheetHeight;
      backdropOpacity.value = 0;
      panTranslateY.value = 0;
      sheetOpacity.value = 0;
      setShouldRenderIcons(false);
    }
  }, [visible, showSheet, sheetHeight]);

  // Animated styles
  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + panTranslateY.value }],
    opacity: sheetOpacity.value,
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // Manage portal lifecycle - only depend on visibility to avoid infinite loops
  useEffect(() => {
    if (visible) {
      const modalContent = (
        <Modal
          transparent
          visible={true}
          animationType="fade"
          onRequestClose={handleClose}
        >
          {/* Backdrop */}
          <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
            <TouchableOpacity
              style={styles.backdropTouchable}
              activeOpacity={1}
              onPress={handleBackdropPress}
            />
          </Animated.View>

          {/* Action Sheet */}
          <GestureDetector gesture={panGesture}>
            <Animated.View
              style={[
                styles.container,
                sheetAnimatedStyle,
                {
                  height: sheetHeight,
                  paddingBottom: insets.bottom,
                },
              ]}
            >
              {/* Handle */}
              <View style={styles.handle} />

              {/* Header */}
              {(title || subtitle) && (
                <View style={styles.header}>
                  {title && <Text style={styles.title}>{title}</Text>}
                  {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                </View>
              )}

              {/* Actions */}
              <View style={styles.actionsContainer}>
                {actions.map((action, index) => (
                  <TouchableOpacity
                    key={action.id}
                    style={[
                      styles.actionButton,
                      index < actions.length - 1 && styles.actionButtonBorder,
                    ]}
                    onPress={() => handleActionPress(action)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.actionContent}>
                      {shouldRenderIcons && (
                        <View
                          style={[
                            styles.actionIconContainer,
                            action.variant === "primary" &&
                              styles.primaryIconContainer,
                            action.variant === "destructive" &&
                              styles.destructiveIconContainer,
                          ]}
                        >
                          <Ionicons
                            name={action.icon}
                            size={20}
                            color={
                              action.variant === "primary"
                                ? Colors.dark.whiteText
                                : action.variant === "destructive"
                                  ? Colors.dark.whiteText
                                  : Colors.dark.brandPrimary
                            }
                          />
                        </View>
                      )}
                      <Text
                        style={[
                          styles.actionText,
                          action.variant === "destructive" &&
                            styles.destructiveText,
                        ]}
                      >
                        {action.title}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          </GestureDetector>
        </Modal>
      );

      addPortal(portalKey, modalContent);
    } else {
      removePortal(portalKey);
    }

    return () => {
      removePortal(portalKey);
    };
  }, [visible, shouldRenderIcons]);

  return null;
};

const styles = StyleSheet.create({
  actionButton: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  actionButtonBorder: {
    borderBottomColor: Colors.dark.outline,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionContent: {
    alignItems: "center",
    flexDirection: "row",
  },
  actionIconContainer: {
    alignItems: "center",
    backgroundColor: "rgba(74, 158, 255, 0.1)",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    marginRight: 16,
    width: 40,
  },
  actionText: {
    color: Colors.dark.whiteText,
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },
  actionsContainer: {
    paddingTop: 8,
  },
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    flex: 1,
  },
  backdropTouchable: {
    flex: 1,
  },
  container: {
    backgroundColor: Colors.dark.surfaceCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  destructiveIconContainer: {
    backgroundColor: Colors.dark.error,
  },
  destructiveText: {
    color: Colors.dark.error,
  },
  handle: {
    alignSelf: "center",
    backgroundColor: Colors.dark.outline,
    borderRadius: 2,
    height: 4,
    marginBottom: 8,
    marginTop: 8,
    width: 40,
  },
  header: {
    borderBottomColor: Colors.dark.outline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryIconContainer: {
    backgroundColor: Colors.dark.brandPrimary,
  },
  subtitle: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
});

export default MobileActionSheet;
