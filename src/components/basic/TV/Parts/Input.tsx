import React, { useRef, useState } from "react";
import { TextInput, StyleSheet } from "react-native";

import { Colors } from "@/src/constants/Colors";

interface FocusableTextInputProps {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmitEditing: () => void;
  style?: object;
  focusedStyle?: object;
}

const FocusableTextInput: React.FC<FocusableTextInputProps> = ({
  placeholder,
  value,
  onChangeText,
  onSubmitEditing,
  style,
  focusedStyle,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  return (
    <TextInput
      ref={inputRef}
      style={[styles.input, style, isFocused && focusedStyle]}
      placeholder={placeholder}
      placeholderTextColor={Colors.dark.placeholderText}
      value={value}
      onChangeText={onChangeText}
      autoCapitalize="none"
      autoCorrect={false}
      focusable
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onSubmitEditing={onSubmitEditing}
    />
  );
};

const styles = StyleSheet.create({
  input: {
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: 8,
    color: Colors.dark.inputText,
    fontSize: 18,
    height: 50,
    marginBottom: 20,
    paddingHorizontal: 15,
    width: "100%",
  },
});

export default FocusableTextInput;
