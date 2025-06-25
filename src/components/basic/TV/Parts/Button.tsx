import React, { useState } from "react";
import { Pressable, Text, StyleSheet } from "react-native";

import { Colors } from "@/src/constants/Colors";

interface FocusableButtonProps {
  title: string;
  onPress: () => void;
  style?: object;
  focusedStyle?: object;
  textStyle?: object;
}

const FocusableButton: React.FC<FocusableButtonProps> = ({
  title,
  onPress,
  style,
  focusedStyle,
  textStyle,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Pressable
      focusable
      onPress={onPress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      style={() => [styles.button, style, isFocused && focusedStyle]}
    >
      <Text style={[styles.buttonText, textStyle]}>{title}</Text>
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
  buttonText: {
    color: Colors.light.videoControlText,
    fontSize: 18,
  },
});

export default FocusableButton;
