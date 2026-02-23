// src/stores/subtitlePreferencesStore.ts

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface SubtitlePreferencesState {
  /** Whether subtitles are enabled (false = user explicitly turned them off) */
  subtitlesEnabled: boolean;
  /** The last language the user selected (e.g. "English") */
  preferredLanguage: string | null;
  setSubtitlesEnabled: (enabled: boolean) => void;
  setPreferredLanguage: (language: string | null) => void;
}

export const useSubtitlePreferencesStore =
  create<SubtitlePreferencesState>()(
    persist(
      (set) => ({
        subtitlesEnabled: true,
        preferredLanguage: null,
        setSubtitlesEnabled: (enabled) => set({ subtitlesEnabled: enabled }),
        setPreferredLanguage: (language) =>
          set({ preferredLanguage: language }),
      }),
      {
        name: "subtitle-preferences",
        storage: createJSONStorage(() => AsyncStorage),
      },
    ),
  );
