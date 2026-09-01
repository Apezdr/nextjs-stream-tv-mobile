// src/stores/qualityPreferencesStore.ts
//
// Device-local quality preferences for the delivery-tiers contract. Per-device
// is deliberate: the living-room TV and a phone on cellular want different
// defaults. Preferences survive sign-out (same as subtitle/search prefs) —
// note the shared-device implication before changing that.
//
// Unlike the other preference stores this one gates PLAYBACK SOURCE
// resolution: useOptimizedVideoPlayer pins the first URL it is handed for the
// life of the mount, so the watch screens must wait for `hasHydrated` before
// creating the player — a late-hydrating "original" preference would
// otherwise load the wrong master with no way to correct it.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { QualityTierId } from "@/src/utils/qualityTiers";

/**
 * Remembered per-title choices are capped; the oldest entry is evicted first.
 */
const MAX_REMEMBERED_TIERS = 200;

/**
 * Stable per-title key. NEVER key by videoURL — the server rotates it.
 */
export function qualityPrefMediaKey(
  mediaType: string,
  mediaId: string,
): string {
  return `${mediaType}:${mediaId}`;
}

interface QualityPreferencesState {
  /** Fallback tier when a title has no remembered choice. */
  globalDefault: QualityTierId;
  /**
   * Implicit remember-last-choice (Plex-style): any tier picked in the
   * in-player menu is stored per title and wins over the global default.
   */
  rememberedTiers: Record<string, QualityTierId>;
  /** Insertion order of rememberedTiers keys, oldest first, for eviction. */
  rememberedOrder: string[];
  /** Mobile: avoid Original/high-bitrate tiers automatically on cellular. */
  cellularDataSaver: boolean;
  /** True once AsyncStorage rehydration finished (success or failure). */
  hasHydrated: boolean;
  setGlobalDefault: (tier: QualityTierId) => void;
  rememberTier: (mediaKey: string, tier: QualityTierId) => void;
  setCellularDataSaver: (enabled: boolean) => void;
}

export const useQualityPreferencesStore = create<QualityPreferencesState>()(
  persist(
    (set) => ({
      globalDefault: "auto",
      rememberedTiers: {},
      rememberedOrder: [],
      cellularDataSaver: true,
      hasHydrated: false,
      setGlobalDefault: (tier) => set({ globalDefault: tier }),
      rememberTier: (mediaKey, tier) =>
        set((state) => {
          const rememberedTiers = {
            ...state.rememberedTiers,
            [mediaKey]: tier,
          };
          const rememberedOrder = [
            ...state.rememberedOrder.filter((key) => key !== mediaKey),
            mediaKey,
          ];
          while (rememberedOrder.length > MAX_REMEMBERED_TIERS) {
            const evicted = rememberedOrder.shift();
            if (evicted) delete rememberedTiers[evicted];
          }
          return { rememberedTiers, rememberedOrder };
        }),
      setCellularDataSaver: (enabled) => set({ cellularDataSaver: enabled }),
    }),
    {
      name: "quality-preferences",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        globalDefault: state.globalDefault,
        rememberedTiers: state.rememberedTiers,
        rememberedOrder: state.rememberedOrder,
        cellularDataSaver: state.cellularDataSaver,
      }),
      // Fires after the rehydration attempt settles either way — an empty or
      // unreadable store must still unblock playback.
      onRehydrateStorage: () => () => {
        useQualityPreferencesStore.setState({ hasHydrated: true });
      },
    },
  ),
);
