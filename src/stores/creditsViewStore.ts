// src/stores/creditsViewStore.ts

import { create } from "zustand";

import type { Credits } from "@/src/data/types/content.types";

/**
 * Hands a title's already-loaded `Credits` from a TV media-info screen to the
 * credits view, so opening the view costs no request. Keyed by
 * `titleCreditsKey` so the view can tell a stale hand-off from its own title
 * and fetch instead. Not persisted: it only lives for one hop.
 */
interface CreditsViewState {
  key: string | null;
  title: string | null;
  subtitle: string | null;
  credits: Credits | null;
  hand: (handoff: {
    key: string;
    title: string;
    subtitle?: string | null;
    credits: Credits;
  }) => void;
  clear: () => void;
}

export const useCreditsViewStore = create<CreditsViewState>()((set) => ({
  key: null,
  title: null,
  subtitle: null,
  credits: null,
  hand: ({ key, title, subtitle, credits }) =>
    set({ key, title, subtitle: subtitle ?? null, credits }),
  clear: () => set({ key: null, title: null, subtitle: null, credits: null }),
}));
