import React, { memo, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity as RNTouchableOpacity,
  TouchableOpacityProps,
} from "react-native";

// Create TV-compatible TouchableOpacity component
interface TVTouchableProps extends TouchableOpacityProps {
  isTVSelectable?: boolean;
  hasTVPreferredFocus?: boolean;
  focusable?: boolean;
}

// ForwardRef approach for TVTouchable
const TouchableOpacity =
  RNTouchableOpacity as unknown as React.ForwardRefExoticComponent<
    TVTouchableProps & React.RefAttributes<typeof RNTouchableOpacity>
  >;

interface SelectableItem {
  label: string;
  value: string | number;
}

interface ContentSelectorProps {
  title: string;
  items: SelectableItem[];
  selectedValue: string | number | null;
  onSelect: (value: string | number) => void;
  shouldFocus?: boolean;
  onFirstItemFocused?: () => void;
}

// Memoized component for content selection lists (shows, seasons, etc.)
const ContentSelector = memo(
  ({
    title,
    items,
    selectedValue,
    onSelect,
    shouldFocus = false,
    onFirstItemFocused,
  }: ContentSelectorProps) => {
    // Handle focus callback
    useEffect(() => {
      if (shouldFocus && onFirstItemFocused && items.length > 0) {
        // Notify parent when this component should focus its first item
        onFirstItemFocused();
      }
    }, [shouldFocus, items.length, onFirstItemFocused]);

    if (items.length === 0) {
      return null;
    }

    return (
      <View style={styles.listContainer}>
        <Text style={styles.label}>{title}</Text>
        <ScrollView>
          {items.map((item, idx) => (
            <TouchableOpacity
              key={`${item.value}`}
              focusable
              hasTVPreferredFocus={shouldFocus && idx === 0}
              onFocus={() =>
                shouldFocus &&
                idx === 0 &&
                onFirstItemFocused &&
                onFirstItemFocused()
              }
              style={[
                styles.listItem,
                selectedValue === item.value && styles.listItemSelected,
              ]}
              onPress={() => onSelect(item.value)}
              isTVSelectable
            >
              <Text style={styles.listItemText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  label: {
    color: "#E5E5E5",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 10,
  },
  listContainer: {
    flex: 1,
    marginBottom: 20,
  },
  listItem: {
    borderRadius: 8,
    marginBottom: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  listItemSelected: {
    backgroundColor: "#E50914",
  },
  listItemText: {
    color: "#BDBDBD",
    fontSize: 18,
  },
});

export default ContentSelector;
