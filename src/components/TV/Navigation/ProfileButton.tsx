import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useRef, useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity as RNTouchableOpacity,
  Platform,
  Animated,
  View,
  BackHandler,
  TVFocusGuideView,
} from "react-native";

import { Colors } from "@/src/constants/Colors";
import {
  PROFILE_DROPDOWN_ITEMS,
  ProfileDropdownItem,
  TOP_NAV_CONFIG,
} from "@/src/constants/TopNavConstants";
import { useAuth } from "@/src/providers/AuthProvider";

// Create a TV-compatible TouchableOpacity component
interface TVTouchableProps
  extends React.ComponentProps<typeof RNTouchableOpacity> {
  isTVSelectable?: boolean;
  hasTVPreferredFocus?: boolean;
}

const TouchableOpacity =
  RNTouchableOpacity as React.ComponentType<TVTouchableProps>;

interface ProfileButtonProps {
  hasTVPreferredFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

const ProfileButton: React.FC<ProfileButtonProps> = ({
  hasTVPreferredFocus = false,
  onFocus,
  onBlur,
}) => {
  const { signOut, user } = useAuth();
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [selectedDropdownIndex, setSelectedDropdownIndex] = useState(0);
  const [isDropdownFocused, setIsDropdownFocused] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const dropdownOpacity = useRef(new Animated.Value(0)).current;
  const dropdownTranslateY = useRef(new Animated.Value(-10)).current;
  const hideDropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handlePress = useCallback(() => {
    setIsDropdownVisible(!isDropdownVisible);
  }, [isDropdownVisible]);

  const handleFocus = useCallback(() => {
    // Animate focus state
    Animated.timing(scaleAnim, {
      toValue: 1.1,
      duration: TOP_NAV_CONFIG.ANIMATION_DURATION,
      useNativeDriver: true,
    }).start();

    // Show dropdown on focus
    if (!isDropdownVisible) {
      setIsDropdownVisible(true);
    }

    onFocus?.();
  }, [scaleAnim, isDropdownVisible, onFocus]);

  const handleBlur = useCallback(() => {
    // Animate blur state
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: TOP_NAV_CONFIG.ANIMATION_DURATION,
      useNativeDriver: true,
    }).start();

    // Delay hiding dropdown to allow navigation into it
    hideDropdownTimeoutRef.current = setTimeout(() => {
      // Only hide if dropdown items are not focused
      if (!isDropdownFocused) {
        setIsDropdownVisible(false);
        // Only call onBlur when focus completely leaves the profile area
        onBlur?.();
      }
    }, 100); // Small delay to allow focus to move to dropdown items
  }, [scaleAnim, isDropdownFocused, onBlur]);

  const handleDropdownItemAction = useCallback(
    async (action: ProfileDropdownItem["action"]) => {
      setIsDropdownVisible(false);

      switch (action) {
        case "switch-profiles":
          // Implement profile switching functionality
          try {
            // For now, we'll show a placeholder message since we don't have multiple profiles
            // In a real implementation, this would show a profile selection screen
            console.log(
              "Profile switching: Currently only one profile available",
            );
            // TODO: Navigate to profile selection screen when multiple profiles are supported
            // router.push('/profiles');
          } catch (error) {
            console.error("Profile switching error:", error);
          }
          break;
        case "sign-out":
          try {
            console.log("Signing out user...");
            await signOut();
          } catch (error) {
            console.error("Sign out error:", error);
          }
          break;
        case "exit-app":
          if (Platform.isTV) {
            console.log("Exiting TV app...");
            BackHandler.exitApp();
          } else {
            console.log("Exit app is only available on TV platform");
          }
          break;
        default:
          console.warn("Unknown profile action:", action);
      }
    },
    [signOut],
  );

  const handleDropdownItemFocus = useCallback(() => {
    // Clear any pending hide timeout when dropdown item gets focus
    if (hideDropdownTimeoutRef.current) {
      clearTimeout(hideDropdownTimeoutRef.current);
      hideDropdownTimeoutRef.current = null;
    }
    setIsDropdownFocused(true);
  }, []);

  const handleDropdownItemBlur = useCallback(() => {
    setIsDropdownFocused(false);
    // Set a timeout to hide dropdown when focus leaves dropdown items
    hideDropdownTimeoutRef.current = setTimeout(() => {
      setIsDropdownVisible(false);
    }, 100);
  }, []);

  // Animate dropdown visibility
  useEffect(() => {
    if (isDropdownVisible) {
      Animated.parallel([
        Animated.timing(dropdownOpacity, {
          toValue: 1,
          duration: TOP_NAV_CONFIG.ANIMATION_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(dropdownTranslateY, {
          toValue: 0,
          duration: TOP_NAV_CONFIG.ANIMATION_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(dropdownOpacity, {
          toValue: 0,
          duration: TOP_NAV_CONFIG.ANIMATION_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(dropdownTranslateY, {
          toValue: -10,
          duration: TOP_NAV_CONFIG.ANIMATION_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isDropdownVisible, dropdownOpacity, dropdownTranslateY]);

  // Handle TV remote navigation within dropdown
  const handleDropdownKeyPress = useCallback(
    (direction: "up" | "down" | "select") => {
      if (!isDropdownVisible) return;

      switch (direction) {
        case "up":
          setSelectedDropdownIndex((prev) =>
            prev > 0 ? prev - 1 : PROFILE_DROPDOWN_ITEMS.length - 1,
          );
          break;
        case "down":
          setSelectedDropdownIndex((prev) =>
            prev < PROFILE_DROPDOWN_ITEMS.length - 1 ? prev + 1 : 0,
          );
          break;
        case "select": {
          const selectedItem = PROFILE_DROPDOWN_ITEMS[selectedDropdownIndex];
          if (selectedItem) {
            handleDropdownItemAction(selectedItem.action);
          }
          break;
        }
      }
    },
    [isDropdownVisible, selectedDropdownIndex, handleDropdownItemAction],
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideDropdownTimeoutRef.current) {
        clearTimeout(hideDropdownTimeoutRef.current);
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.profileButton}
        onPress={handlePress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        activeOpacity={1.0}
        isTVSelectable={Platform.isTV}
        hasTVPreferredFocus={hasTVPreferredFocus && Platform.isTV}
      >
        <Animated.View
          style={[
            styles.profileContent,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Ionicons
            name="person-circle"
            size={32}
            color={Colors.dark.whiteText}
          />
          {user && (
            <Text style={styles.userName} numberOfLines={1}>
              {user.name}
            </Text>
          )}
        </Animated.View>
      </TouchableOpacity>

      {/* Dropdown Menu */}
      {isDropdownVisible && (
        <TVFocusGuideView trapFocusDown autoFocus>
          <Animated.View
            style={[
              styles.dropdown,
              {
                opacity: dropdownOpacity,
                transform: [{ translateY: dropdownTranslateY }],
              },
            ]}
          >
            {PROFILE_DROPDOWN_ITEMS.map((item, index) => (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.dropdownItem,
                  selectedDropdownIndex === index &&
                    styles.selectedDropdownItem,
                ]}
                onPress={() => handleDropdownItemAction(item.action)}
                onFocus={handleDropdownItemFocus}
                onBlur={handleDropdownItemBlur}
                isTVSelectable={Platform.isTV}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={
                    selectedDropdownIndex === index
                      ? Colors.dark.whiteText
                      : "#CCCCCC"
                  }
                  style={styles.dropdownIcon}
                />
                <Text
                  style={[
                    styles.dropdownText,
                    selectedDropdownIndex === index &&
                      styles.selectedDropdownText,
                  ]}
                >
                  {item.title}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        </TVFocusGuideView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
    zIndex: 1000,
  },
  dropdown: {
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    borderRadius: 8,
    elevation: 8,
    marginTop: 8,
    minWidth: TOP_NAV_CONFIG.PROFILE_DROPDOWN_WIDTH,
    paddingVertical: 8,
    position: "absolute",
    right: 0,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    top: "100%",
  },
  dropdownIcon: {
    marginRight: 12,
  },
  dropdownItem: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownText: {
    color: "#CCCCCC",
    fontSize: 14,
    fontWeight: "500",
  },
  profileButton: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  profileContent: {
    alignItems: "center",
    flexDirection: "row",
  },
  selectedDropdownItem: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  selectedDropdownText: {
    color: Colors.dark.whiteText,
    fontWeight: "600",
  },
  userName: {
    color: Colors.dark.whiteText,
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
    maxWidth: 120,
  },
});

export default ProfileButton;
