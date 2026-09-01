jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import {
  qualityPrefMediaKey,
  useQualityPreferencesStore,
} from "../qualityPreferencesStore";

const flushHydration = () => new Promise((resolve) => setImmediate(resolve));

describe("qualityPrefMediaKey", () => {
  it("keys by stable media identity, never by URL", () => {
    expect(qualityPrefMediaKey("movie", "123")).toBe("movie:123");
    expect(qualityPrefMediaKey("tv", "show-9")).toBe("tv:show-9");
  });
});

describe("useQualityPreferencesStore", () => {
  it("marks hydration complete even with an empty store", async () => {
    await flushHydration();
    expect(useQualityPreferencesStore.getState().hasHydrated).toBe(true);
  });

  it("remembers the last tier per title and updates in place", () => {
    const { rememberTier } = useQualityPreferencesStore.getState();
    rememberTier("movie:1", "original");
    rememberTier("movie:1", "auto");
    const state = useQualityPreferencesStore.getState();
    expect(state.rememberedTiers["movie:1"]).toBe("auto");
    expect(
      state.rememberedOrder.filter((key) => key === "movie:1"),
    ).toHaveLength(1);
  });

  it("evicts the oldest remembered title beyond the cap", () => {
    const { rememberTier } = useQualityPreferencesStore.getState();
    for (let i = 0; i < 205; i++) {
      rememberTier(`movie:cap-${i}`, "original");
    }
    const state = useQualityPreferencesStore.getState();
    expect(state.rememberedOrder.length).toBeLessThanOrEqual(200);
    expect(state.rememberedTiers["movie:cap-0"]).toBeUndefined();
    expect(state.rememberedTiers["movie:cap-204"]).toBe("original");
  });
});
