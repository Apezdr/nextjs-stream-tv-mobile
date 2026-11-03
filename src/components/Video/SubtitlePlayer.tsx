// src/components/Video/SubtitlePlayer.tsx
import { memo, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SubtitleStyle, SubtitleBackgroundOption } from "./CaptionControls";

import { loadCaptionCues } from "@/src/data/services/captionService";
import { CaptionCue, cueAt } from "@/src/utils/captionCues";

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
  /**
   * Multiplier on the caption's size, padding and bottom offset. The
   * caption styles were sized for a video that has the whole screen; over
   * the portrait watch page's 16:9 strip they cover half the picture.
   */
  scale?: number;
}

/**
 * Draws the caption cue for the player's current time over the video.
 * Loads the selected language's file once through the authenticated client
 * (see captionService) and looks the cue up per time tick; the cues are
 * kept across ticks, so a re-render never refetches.
 */
const SubtitlePlayer = memo(
  ({
    currentTime,
    captionURLs,
    selectedCaptionLanguage,
    selectedSubtitleStyle,
    selectedSubtitleBackground,
    scale = 1,
  }: SubtitlePlayerProps) => {
    const subtitleUrl =
      selectedCaptionLanguage && captionURLs?.[selectedCaptionLanguage]?.url
        ? captionURLs[selectedCaptionLanguage].url
        : null;

    const [cues, setCues] = useState<CaptionCue[]>([]);
    useEffect(() => {
      setCues([]);
      if (!subtitleUrl) return;
      let cancelled = false;
      loadCaptionCues(subtitleUrl).then((loaded) => {
        if (!cancelled && loaded) setCues(loaded);
      });
      return () => {
        cancelled = true;
      };
    }, [subtitleUrl]);

    const cue = useMemo(() => cueAt(cues, currentTime), [cues, currentTime]);

    // Use selected style and apply the selected background to textStyle.backgroundColor
    const textStyle = useMemo(() => {
      const chosen = selectedSubtitleStyle?.textStyle;
      const baseSize =
        typeof chosen?.fontSize === "number"
          ? chosen.fontSize
          : styles.subtitleText.fontSize;
      return [
        styles.subtitleText,
        chosen ?? null,
        {
          fontSize: Math.round(baseSize * scale),
          lineHeight: undefined,
          padding: Math.round(styles.subtitleText.padding * scale),
          backgroundColor:
            selectedSubtitleBackground?.backgroundColor || "transparent",
        },
      ];
    }, [selectedSubtitleStyle, selectedSubtitleBackground, scale]);
    const edge = Math.round(styles.subtitleContainer.bottom * scale);
    // Honour the cue's position (ASS {\an8} / VTT line:): top-anchored cues
    // sit at the top edge, middle ones centre on the picture.
    const containerStyle = useMemo(() => {
      if (cue?.position === "top") {
        return [styles.subtitleContainer, { top: edge, bottom: undefined }];
      }
      if (cue?.position === "middle") {
        return [
          styles.subtitleContainer,
          { top: 0, bottom: 0, justifyContent: "center" as const },
        ];
      }
      return [styles.subtitleContainer, { bottom: edge }];
    }, [cue?.position, edge]);

    if (!subtitleUrl || !cue) return null;

    // Styled runs nest inside the cue's Text so the caption style sheet's
    // size, weight, colour and background apply to the whole cue, and each
    // run only adds its italic / bold / underline / colour.
    return (
      <View style={containerStyle} pointerEvents="none">
        <Text style={textStyle} testID="subtitle-text">
          {cue.runs.map((run, index) => (
            <Text
              key={`${index}-${run.text.length}`}
              style={[
                run.italic && styles.italic,
                run.bold && styles.bold,
                run.underline && styles.underline,
                run.color ? { color: run.color } : null,
              ]}
            >
              {run.text}
            </Text>
          ))}
        </Text>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  bold: {
    fontWeight: "bold",
  },
  italic: {
    fontStyle: "italic",
  },
  subtitleContainer: {
    alignItems: "center",
    backgroundColor: "transparent",
    bottom: 50,
    left: 0,
    position: "absolute",
    right: 0,
  },
  // The base the library used to draw with; the caption style sheet's own
  // size and weight (CaptionControls) layer on top.
  subtitleText: {
    alignSelf: "center",
    backgroundColor: "transparent",
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "bold",
    padding: 25,
    textAlign: "center",
    textShadowColor: "#000",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  underline: {
    textDecorationLine: "underline",
  },
});

SubtitlePlayer.displayName = "SubtitlePlayer";

export default SubtitlePlayer;
