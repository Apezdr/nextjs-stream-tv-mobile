// src/components/Video/SubtitlePlayer.tsx
import { memo } from "react";
import { StyleSheet } from "react-native";
import Subtitles from "react-native-subtitles";

import { SubtitleStyle, SubtitleBackgroundOption } from "./CaptionControls";

interface CaptionTrack {
  srcLang: string;
  url: string;
  lastModified: string;
  sourceServerId: string;
}

interface SubtitlePlayerProps {
  currentTime: number;
  captionURLs?: Record<string, CaptionTrack>;
  selectedCaptionLanguage?: string | null;
  selectedSubtitleStyle?: SubtitleStyle;
  selectedSubtitleBackground?: SubtitleBackgroundOption;
}

const SubtitlePlayer = memo(
  ({
    currentTime,
    captionURLs,
    selectedCaptionLanguage,
    selectedSubtitleStyle,
    selectedSubtitleBackground,
  }: SubtitlePlayerProps) => {
    // Only render subtitles if we have a selected language and URL
    if (
      !selectedCaptionLanguage ||
      !captionURLs?.[selectedCaptionLanguage]?.url
    ) {
      return null;
    }

    // Use selected style and apply the selected background to textStyle.backgroundColor
    const textStyle = selectedSubtitleStyle
      ? {
          ...styles.subtitleText,
          ...selectedSubtitleStyle.textStyle,
          backgroundColor:
            selectedSubtitleBackground?.backgroundColor || "transparent",
        }
      : {
          ...styles.subtitleText,
          backgroundColor:
            selectedSubtitleBackground?.backgroundColor || "transparent",
        };

    return (
      <Subtitles
        currentTime={currentTime}
        selectedsubtitle={{
          file: captionURLs[selectedCaptionLanguage].url,
        }}
        containerStyle={styles.subtitleContainer}
        textStyle={textStyle}
      />
    );
  },
);

const styles = StyleSheet.create({
  subtitleContainer: {
    alignItems: "center",
    backgroundColor: "transparent",
    bottom: 50,
    left: 0,
    position: "absolute",
    right: 0,
  },

  subtitleText: {
    backgroundColor: "transparent",
    color: "#FFFFFF",
    fontWeight: "bold",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
});

SubtitlePlayer.displayName = "SubtitlePlayer";

export default SubtitlePlayer;
