import { FC } from "react";
import { Pressable, Text, StyleSheet } from "react-native";

import { Colors } from "@/src/constants/Colors";

interface MobileButtonProps {
  title: string;
  onPress: () => void;
  style?: object;
  focusedStyle?: object;
  textStyle?: object;
}

const MobileButton: FC<MobileButtonProps> = ({
  title,
  onPress,
  style,
  textStyle,
}) => {
  return (
    <Pressable focusable onPress={onPress} style={() => [styles.button, style]}>
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

export default MobileButton;
