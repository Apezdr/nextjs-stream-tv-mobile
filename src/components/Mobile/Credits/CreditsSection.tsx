import { Ionicons } from "@expo/vector-icons";
import React, { memo, useCallback, useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import { Colors } from "@/src/constants/Colors";
import type { Credits, CreditsEntry } from "@/src/data/types/content.types";
import { useDimensions } from "@/src/hooks/useDimensions";
import {
  entryAppliesTo,
  entryHeading,
  entryKey,
  entryNotices,
  entryRows,
  groupCreditsEntries,
  isHttpUrl,
} from "@/src/utils/credits";

/**
 * "Credits & licenses" below a synopsis, as on the web: groups in the shared
 * order, label-and-value rows per entry, a collapsed "Notices and conditions"
 * toggle. Text is shown whole — no line clamps, no markup parsing — and only
 * an http(s) URL is a link. Below about 400 dp the labels stack above their
 * values so nothing needs to scroll sideways.
 */

const NARROW_WIDTH = 400;
const LABEL_COLOR = "#8C8C8C";
const CARD_BG = "rgba(255, 255, 255, 0.06)";

interface CreditsSectionProps {
  credits: Credits;
  heading?: string;
  /** One line under the heading, e.g. what the library's credits cover. */
  description?: string;
  style?: StyleProp<ViewStyle>;
}

function CreditsSectionComponent({
  credits,
  heading = "Credits & licenses",
  description,
  style,
}: CreditsSectionProps) {
  const { window } = useDimensions();
  const stacked = window.width < NARROW_WIDTH;
  const groups = useMemo(() => groupCreditsEntries(credits.entries), [credits]);

  return (
    <View style={[styles.section, style]}>
      <Text style={styles.heading} accessibilityRole="header">
        {heading}
      </Text>
      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}
      {groups.map((group) => (
        <View key={group.heading} style={styles.group}>
          <Text style={styles.groupHeading} accessibilityRole="header">
            {group.heading}
          </Text>
          {group.entries.map((entry, index) => (
            <CreditsEntryCard
              key={entryKey(entry, index)}
              entry={entry}
              stacked={stacked}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function openLink(url: string) {
  if (!isHttpUrl(url)) return;
  Linking.openURL(url).catch(() => {});
}

interface CreditsEntryCardProps {
  entry: CreditsEntry;
  stacked: boolean;
}

const CreditsEntryCard = memo(function CreditsEntryCard({
  entry,
  stacked,
}: CreditsEntryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => entryRows(entry), [entry]);
  const notices = useMemo(() => entryNotices(entry), [entry]);

  const toggle = useCallback(() => setExpanded((value) => !value), []);

  return (
    <View style={styles.card}>
      <Text style={styles.entryHeading} accessibilityRole="header">
        {entryHeading(entry)}
      </Text>
      <Text style={styles.appliesTo}>{entryAppliesTo(entry)}</Text>

      {rows.map((row) => (
        <View
          key={row.label}
          style={[styles.row, stacked ? styles.rowStacked : null]}
        >
          <Text
            style={[styles.rowLabel, stacked ? styles.rowLabelStacked : null]}
          >
            {row.label}
          </Text>
          <View style={styles.rowValue}>
            {row.lines.map((line, index) =>
              line.url ? (
                <Text
                  key={`${row.label}-${index}`}
                  style={styles.link}
                  accessibilityRole="link"
                  onPress={() => openLink(line.url!)}
                >
                  {line.text}
                </Text>
              ) : (
                <Text key={`${row.label}-${index}`} style={styles.rowText}>
                  {line.text}
                </Text>
              ),
            )}
          </View>
        </View>
      ))}

      {notices.length > 0 ? (
        <>
          <Pressable
            onPress={toggle}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            hitSlop={8}
            style={styles.noticesToggle}
          >
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={LABEL_COLOR}
            />
            <Text style={styles.noticesToggleText}>
              Notices and conditions ({notices.length})
            </Text>
          </Pressable>
          {expanded
            ? notices.map((notice, index) => (
                <View key={`notice-${index}`} style={styles.notice}>
                  {notice.label ? (
                    <Text style={styles.rowLabel}>{notice.label}</Text>
                  ) : null}
                  <Text style={styles.rowText}>{notice.text}</Text>
                </View>
              ))
            : null}
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  appliesTo: {
    color: LABEL_COLOR,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    marginBottom: 8,
    padding: 12,
  },
  description: {
    color: LABEL_COLOR,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
    marginTop: -6,
  },
  entryHeading: {
    color: Colors.dark.whiteText,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: 2,
  },
  group: {
    marginBottom: 12,
  },
  groupHeading: {
    color: LABEL_COLOR,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  heading: {
    color: Colors.dark.whiteText,
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
  },
  link: {
    color: Colors.dark.brandPrimary,
    fontSize: 14,
    lineHeight: 20,
    textDecorationLine: "underline",
  },
  notice: {
    borderLeftColor: "rgba(255, 255, 255, 0.2)",
    borderLeftWidth: 2,
    marginTop: 8,
    paddingLeft: 10,
  },
  noticesToggle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
    paddingVertical: 4,
  },
  noticesToggleText: {
    color: LABEL_COLOR,
    fontSize: 13,
    fontWeight: "500",
  },
  row: {
    flexDirection: "row",
    marginBottom: 6,
  },
  rowLabel: {
    color: LABEL_COLOR,
    fontSize: 13,
    lineHeight: 20,
    width: 104,
  },
  rowLabelStacked: {
    marginBottom: 2,
    width: undefined,
  },
  rowStacked: {
    flexDirection: "column",
  },
  rowText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    lineHeight: 20,
  },
  rowValue: {
    flex: 1,
    flexShrink: 1,
  },
  section: {
    marginBottom: 24,
  },
});

export default memo(CreditsSectionComponent);
