// src/components/Video/SubtitlePlayer.tsx
import { memo, useMemo } from "react";
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
    const subtitleUrl =
      selectedCaptionLanguage && captionURLs?.[selectedCaptionLanguage]?.url
        ? captionURLs[selectedCaptionLanguage].url
        : null;

    // These two objects MUST keep a stable identity across ticks. This
    // component re-renders once per second (currentTime), and the vendored
    // react-native-subtitles is not memoized: its parse effect is keyed on
    // `selectedsubtitle`, so a fresh object literal here made it re-fetch the
    // entire caption file over HTTP and re-parse every cue once per second for
    // the whole of playback.
    const selectedsubtitle = useMemo(
      () => (subtitleUrl ? { file: subtitleUrl } : null),
      [subtitleUrl],
    );

    // Use selected style and apply the selected background to textStyle.backgroundColor
    const textStyle = useMemo(
      () => ({
        ...styles.subtitleText,
        ...(selectedSubtitleStyle ? selectedSubtitleStyle.textStyle : null),
        backgroundColor:
          selectedSubtitleBackground?.backgroundColor || "transparent",
      }),
      [selectedSubtitleStyle, selectedSubtitleBackground],
    );

    // Only render subtitles if we have a selected language and URL
    if (!selectedsubtitle) {
      return null;
    }

    return (
      <Subtitles
        currentTime={currentTime}
        selectedsubtitle={selectedsubtitle}
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
