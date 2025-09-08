import React, { useState } from "react";
import { Pressable, Text, StyleSheet, View } from "react-native";
import { SvgProps } from "react-native-svg";

import { Colors } from "@/src/constants/Colors";

interface FocusableButtonProps {
  title: string;
  onPress: () => void;
  style?: object;
  focusedStyle?: object;
  textStyle?: object;
  hasTVPreferredFocus?: boolean;
  leftIcon?: React.ComponentType<SvgProps>;
  iconSize?: number;
}

const FocusableButton: React.FC<FocusableButtonProps> = ({
  title,
  onPress,
  style,
  focusedStyle,
  textStyle,
  hasTVPreferredFocus = false,
  leftIcon: LeftIcon,
  iconSize = 24,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Pressable
      focusable
      onPress={onPress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      style={() => [styles.button, style, isFocused && focusedStyle]}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <View style={styles.buttonContent}>
        {LeftIcon && (
          <View style={styles.iconContainer}>
            <LeftIcon width={iconSize} height={iconSize} />
          </View>
        )}
        <View style={[styles.textContainer, LeftIcon && styles.textWithIcon]}>
          <Text style={[styles.buttonText, textStyle]}>{title}</Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: Colors.light.link,
    borderRadius: 8,
    height: 50,
    justifyContent: "center",
    marginVertical: 10,
    width: "100%",
  },
  buttonContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    position: "relative",
  },
  textContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  textWithIcon: {
    paddingLeft: 0, // Space for icon (24px icon + 12px margin)
  },
  buttonText: {
    color: Colors.light.videoControlText,
    fontSize: 18,
    textAlign: "center",
  },
  iconContainer: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
    left: -33,
    position: "absolute",
    width: 24,
  },
});

export default FocusableButton;
