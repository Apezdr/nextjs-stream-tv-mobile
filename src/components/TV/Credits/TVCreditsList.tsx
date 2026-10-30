import { Ionicons } from "@expo/vector-icons";
import React, { memo, useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/src/constants/Colors";
import type { Credits, CreditsEntry } from "@/src/data/types/content.types";
import {
  entryAppliesTo,
  entryHeading,
  entryKey,
  entryNotices,
  entryRows,
  groupCreditsEntries,
} from "@/src/utils/credits";

/**
 * A title's (or the library's) credits for the ten-foot screen: groups in
 * the shared order, one focusable card per entry so D-pad down walks the
 * list and the ScrollView follows focus. Select on a card opens and closes
 * its "Notices and conditions".
 *
 * Text is text: nothing here is clamped, ellipsized or parsed. A URL is shown
 * as plain text without its scheme — Fire TV has no browser to rely on, and
 * the reader needs to read the address, not open it.
 *
 * Sizes follow the TV Settings screen (16 dp labels, 13 dp secondary text):
 * the SHIELD renders 1080p as a 960×540 dp canvas, so the hand-off's 24 dp
 * body filled the screen with a single card.
 */

const LABEL_COLOR = "rgba(255, 255, 255, 0.72)";
const BODY_COLOR = "rgba(255, 255, 255, 0.94)";
const CARD_BG = "rgba(255, 255, 255, 0.06)";
const CARD_BG_FOCUSED = "rgba(255, 255, 255, 0.16)";
const CARD_BORDER_FOCUSED = "#FFFFFF";

interface TVCreditsListProps {
  credits: Credits;
  /** The first card takes focus on mount. One list per screen should ask. */
  autoFocusFirst?: boolean;
}

function TVCreditsListComponent({
  credits,
  autoFocusFirst = false,
}: TVCreditsListProps) {
  const groups = useMemo(() => groupCreditsEntries(credits.entries), [credits]);

  let isFirst = true;
  return (
    <View>
      {groups.map((group) => (
        <View key={group.heading} style={styles.group}>
          <Text style={styles.groupHeading}>{group.heading}</Text>
          {group.entries.map((entry, index) => {
            const preferred = autoFocusFirst && isFirst;
            isFirst = false;
            return (
              <TVCreditsEntry
                key={entryKey(entry, index)}
                entry={entry}
                hasTVPreferredFocus={preferred}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

interface TVCreditsEntryProps {
  entry: CreditsEntry;
  hasTVPreferredFocus?: boolean;
}

const TVCreditsEntry = memo(function TVCreditsEntry({
  entry,
  hasTVPreferredFocus = false,
}: TVCreditsEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => entryRows(entry), [entry]);
  const notices = useMemo(() => entryNotices(entry), [entry]);
  const hasNotices = notices.length > 0;

  const toggleNotices = useCallback(() => {
    if (hasNotices) setExpanded((value) => !value);
  }, [hasNotices]);

  return (
    <Pressable
      focusable
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={toggleNotices}
      style={({ focused }) => [styles.card, focused && styles.cardFocused]}
    >
      <Text style={styles.entryHeading}>{entryHeading(entry)}</Text>
      <Text style={styles.appliesTo}>{entryAppliesTo(entry)}</Text>

      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <View style={styles.rowValue}>
            {row.lines.map((line, index) => (
              <Text
                key={`${row.label}-${index}`}
                style={[styles.rowText, line.url ? styles.rowUrl : null]}
              >
                {line.text}
              </Text>
            ))}
          </View>
        </View>
      ))}

      {hasNotices ? (
        <View style={styles.noticesToggle}>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={LABEL_COLOR}
          />
          <Text style={styles.noticesToggleText}>
            Notices and conditions ({notices.length}) ·{" "}
            {expanded ? "Select to hide" : "Select to show"}
          </Text>
        </View>
      ) : null}

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
    </Pressable>
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
    borderColor: "transparent",
    borderRadius: 10,
    borderWidth: 2,
    marginBottom: 8,
    maxWidth: 720,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cardFocused: {
    backgroundColor: CARD_BG_FOCUSED,
    borderColor: CARD_BORDER_FOCUSED,
  },
  entryHeading: {
    color: Colors.dark.whiteText,
    fontSize: 18,
    fontWeight: "bold",
    lineHeight: 24,
    marginBottom: 2,
  },
  group: {
    marginBottom: 16,
  },
  groupHeading: {
    color: LABEL_COLOR,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  notice: {
    borderLeftColor: "rgba(255, 255, 255, 0.25)",
    borderLeftWidth: 2,
    marginTop: 8,
    paddingLeft: 12,
  },
  noticesToggle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
  },
  noticesToggleText: {
    color: LABEL_COLOR,
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    marginBottom: 6,
  },
  rowLabel: {
    color: LABEL_COLOR,
    fontSize: 13,
    lineHeight: 22,
    width: 120,
  },
  rowText: {
    color: BODY_COLOR,
    fontSize: 16,
    lineHeight: 22,
  },
  rowUrl: {
    color: Colors.dark.brandPrimary,
  },
  rowValue: {
    flex: 1,
    flexShrink: 1,
  },
});

export default memo(TVCreditsListComponent);
