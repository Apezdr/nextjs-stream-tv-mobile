/**
 * Lightweight TV genre grid.
 * Renders a 3-column grid of TVGenreCard components.
 * Each card independently fetches a tiny preview — no heavy content rows.
 */
import { memo, useCallback } from "react";
import { FlatList, StyleSheet, TVFocusGuideView, View } from "react-native";

import TVGenreCard, { type TVGenreCardGenre } from "./TVGenreCard";

interface TVGenreGridProps {
  genres: TVGenreCardGenre[];
  contentType: "movie" | "tv";
  onSelectGenre: (genreName: string) => void;
}

const NUM_COLUMNS = 3;

const TVGenreGrid = memo(function TVGenreGrid({
  genres,
  contentType,
  onSelectGenre,
}: TVGenreGridProps) {
  const renderItem = useCallback(
    ({ item, index }: { item: TVGenreCardGenre; index: number }) => (
      <View style={styles.cardWrapper}>
        <TVGenreCard
          genre={item}
          contentType={contentType}
          onPress={onSelectGenre}
          //hasTVPreferredFocus={index === 0}
        />
      </View>
    ),
    [contentType, onSelectGenre],
  );

  const keyExtractor = useCallback(
    (item: TVGenreCardGenre) => String(item.id),
    [],
  );

  return (
    <TVFocusGuideView style={styles.container} trapFocusDown>
      <FlatList
        data={genres}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={NUM_COLUMNS}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={styles.row}
      />
    </TVFocusGuideView>
  );
});

const styles = StyleSheet.create({
  cardWrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  row: {
    marginBottom: 4,
  },
});

export default TVGenreGrid;
