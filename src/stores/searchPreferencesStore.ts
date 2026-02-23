// src/stores/searchPreferencesStore.ts

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type GridColumns = 1 | 2 | 3;

interface SearchPreferencesState {
  /** Persisted grid column preference for TV search */
  tvGridColumns: GridColumns;
  /** Persisted grid column preference for mobile search */
  mobileGridColumns: GridColumns;
  setTvGridColumns: (columns: GridColumns) => void;
  setMobileGridColumns: (columns: GridColumns) => void;
}

export const useSearchPreferencesStore = create<SearchPreferencesState>()(
  persist(
    (set) => ({
      tvGridColumns: 3,
      mobileGridColumns: 2,
      setTvGridColumns: (columns) => set({ tvGridColumns: columns }),
      setMobileGridColumns: (columns) => set({ mobileGridColumns: columns }),
    }),
    {
      name: "search-preferences",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
