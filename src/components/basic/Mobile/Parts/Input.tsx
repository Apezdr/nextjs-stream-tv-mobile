import { useRef, FC } from "react";
import { TextInput, StyleSheet } from "react-native";

import { Colors } from "@/src/constants/Colors";

interface MobileTextInputProps {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmitEditing: () => void;
  style?: object;
  //focusedStyle?: object;
}

const MobileTextInput: FC<MobileTextInputProps> = ({
  placeholder = "",
  value,
  onChangeText,
  onSubmitEditing,
  style,
  //focusedStyle,
}) => {
  const inputRef = useRef(null);

  return (
    <TextInput
      ref={inputRef}
      style={[styles.input, style]}
      placeholder={placeholder}
      placeholderTextColor={Colors.dark.placeholderText}
      value={value}
      onChangeText={onChangeText}
      onSubmitEditing={onSubmitEditing}
      autoCapitalize="none"
      autoCorrect={false}
      focusable
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

export default MobileTextInput;
