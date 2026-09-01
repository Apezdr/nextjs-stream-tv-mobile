import {
  badgeLabel,
  deriveOriginalLabel,
  descentTierFor,
  reasonToUserCopy,
  resolveAvailableTiers,
  resolveInitialTier,
  resolveTierSourceURL,
} from "../qualityTiers";

import { DirectPlayInfo } from "@/src/data/types/directPlay.types";

const OFFERED_DV: DirectPlayInfo = {
  hls: {
    offered: true,
    variantIndex: 6,
    codecs: "hvc1.2.4.L123.B0",
    videoRange: "PQ",
    supplementalCodecs: "dvh1.08.06/db1p",
  },
  file: { available: true, container: "mp4", videoCodec: "hevc" },
};

const OFFERED_HDR10: DirectPlayInfo = {
  hls: { offered: true, videoRange: "PQ" },
  file: { available: true },
};

const OFFERED_SDR: DirectPlayInfo = {
  hls: { offered: true },
  file: { available: true },
};

const WITHHELD_OPEN_GOP: DirectPlayInfo = {
  hls: { offered: false, reason: "open-gop-avc" },
  file: { available: true, container: "mp4", videoCodec: "h264" },
};

const WITHHELD_NO_FILE: DirectPlayInfo = {
  hls: { offered: false, reason: "unscannable" },
  file: { available: false },
};

const DISABLED: DirectPlayInfo = {
  hls: { offered: false, reason: "disabled" },
  file: { available: false },
};

describe("deriveOriginalLabel", () => {
  it("maps supplementalCodecs to Dolby Vision before videoRange", () => {
    expect(deriveOriginalLabel(OFFERED_DV)).toBe("Original (Dolby Vision)");
  });

  it("maps PQ without supplemental codecs to HDR10", () => {
    expect(deriveOriginalLabel(OFFERED_HDR10)).toBe("Original (HDR10)");
  });

  it("falls back to plain Original", () => {
    expect(deriveOriginalLabel(OFFERED_SDR)).toBe("Original");
  });
});

describe("badgeLabel", () => {
  it("prefers the server-enriched label", () => {
    expect(badgeLabel({ ...OFFERED_SDR, badgeLabel: "Original (IMAX)" })).toBe(
      "Original (IMAX)",
    );
  });

  it("derives when the enriched label is absent", () => {
    expect(badgeLabel(OFFERED_DV)).toBe("Original (Dolby Vision)");
  });

  it("shows no badge when Original is withheld or the verdict is missing", () => {
    expect(badgeLabel(WITHHELD_OPEN_GOP)).toBeNull();
    expect(badgeLabel(null)).toBeNull();
    expect(badgeLabel(undefined)).toBeNull();
  });
});

describe("reasonToUserCopy", () => {
  it("covers the §3 reason table", () => {
    expect(reasonToUserCopy("open-gop-avc")).toMatch(/transcode/i);
    expect(reasonToUserCopy("segment-floor")).toMatch(/streaming limits/);
    expect(reasonToUserCopy("segment-budget")).toMatch(/streaming limits/);
    expect(reasonToUserCopy("unscannable")).toMatch(/analyzed/);
    expect(reasonToUserCopy("ineligible-source")).toMatch(/unmodified/);
    expect(reasonToUserCopy("poisoned")).toMatch(/playback fault/);
  });

  it("hides for disabled and no-reason, generic for unknown reasons", () => {
    expect(reasonToUserCopy("disabled")).toBeNull();
    expect(reasonToUserCopy(undefined)).toBeNull();
    expect(reasonToUserCopy("some-future-reason")).toMatch(/isn't available/);
  });
});

describe("resolveAvailableTiers", () => {
  it("Apple platforms get master-level rows regardless of verdict", () => {
    for (const platform of ["apple-tv", "ios"] as const) {
      for (const info of [null, OFFERED_DV, WITHHELD_NO_FILE, DISABLED]) {
        expect(resolveAvailableTiers(info, platform)).toEqual([
          { id: "auto", label: "Auto (up to Original)" },
          { id: "transcode", label: "Transcoded only" },
        ]);
      }
    }
  });

  it("Android shows Auto only while the verdict is loading", () => {
    expect(resolveAvailableTiers(null, "android-tv")).toEqual([
      { id: "auto", label: "Auto" },
    ]);
  });

  it("Android offers Direct Play whenever the file is available", () => {
    expect(resolveAvailableTiers(OFFERED_DV, "android-tv")).toEqual([
      { id: "auto", label: "Auto" },
      { id: "original", label: "Original (Direct Play)" },
    ]);
    // The escape hatch: HLS-Original withheld but the raw file still plays.
    expect(resolveAvailableTiers(WITHHELD_OPEN_GOP, "android")).toEqual([
      { id: "auto", label: "Auto" },
      { id: "original", label: "Original (Direct Play)" },
    ]);
  });

  it("Android renders an unavailable row with reason copy when nothing serves the original", () => {
    const tiers = resolveAvailableTiers(WITHHELD_NO_FILE, "android-tv");
    expect(tiers).toHaveLength(2);
    expect(tiers[1].id).toBe("original");
    expect(tiers[1].unavailableReason).toMatch(/analyzed/);
  });

  it("prefers server-enriched reason copy on the unavailable row", () => {
    const tiers = resolveAvailableTiers(
      { ...WITHHELD_NO_FILE, reasonCopy: "Server says no." },
      "android-tv",
    );
    expect(tiers[1].unavailableReason).toBe("Server says no.");
  });

  it("hides the Original row entirely when the server feature is off", () => {
    expect(resolveAvailableTiers(DISABLED, "android-tv")).toEqual([
      { id: "auto", label: "Auto" },
    ]);
  });

  it("degrades to Auto-only on the 404 sentinel (no reason, nothing served)", () => {
    // Pre-deploy server: §10 says the menu simply lacks Original — no
    // misleading disabled row.
    expect(
      resolveAvailableTiers(
        { hls: { offered: false }, file: { available: false } },
        "android-tv",
      ),
    ).toEqual([{ id: "auto", label: "Auto" }]);
  });

  it("web builds never get an Original tier", () => {
    expect(resolveAvailableTiers(OFFERED_DV, "web")).toEqual([
      { id: "auto", label: "Auto" },
    ]);
  });
});

const MASTER = "https://t.example.com/stream/abc/master.m3u8";

describe("resolveTierSourceURL", () => {
  it("Apple: auto/original mean the direct master, transcode the default", () => {
    expect(resolveTierSourceURL(MASTER, "auto", OFFERED_DV, "apple-tv")).toBe(
      `${MASTER}?direct=1`,
    );
    expect(resolveTierSourceURL(MASTER, "original", null, "ios")).toBe(
      `${MASTER}?direct=1`,
    );
    expect(
      resolveTierSourceURL(`${MASTER}?direct=1`, "transcode", null, "apple-tv"),
    ).toBe(MASTER);
  });

  it("Android: original is the raw file only when actually served", () => {
    expect(
      resolveTierSourceURL(MASTER, "original", OFFERED_DV, "android-tv"),
    ).toBe("https://t.example.com/stream/abc/file");
    expect(
      resolveTierSourceURL(MASTER, "original", WITHHELD_NO_FILE, "android-tv"),
    ).toBe(MASTER);
    expect(resolveTierSourceURL(MASTER, "auto", OFFERED_DV, "android")).toBe(
      MASTER,
    );
  });

  it("strips a stray direct param from non-Apple default masters", () => {
    expect(
      resolveTierSourceURL(`${MASTER}?direct=1`, "auto", null, "android-tv"),
    ).toBe(MASTER);
  });

  it("web always resolves to the default master", () => {
    expect(
      resolveTierSourceURL(`${MASTER}?direct=1`, "original", OFFERED_DV, "web"),
    ).toBe(MASTER);
  });
});

describe("resolveInitialTier", () => {
  it("Apple honors transcode, treats original as auto, demotes on data saver", () => {
    expect(resolveInitialTier("auto", null, false, "apple-tv")).toBe("auto");
    expect(resolveInitialTier("original", null, false, "ios")).toBe("auto");
    expect(resolveInitialTier("transcode", null, false, "apple-tv")).toBe(
      "transcode",
    );
    expect(resolveInitialTier("auto", null, true, "ios")).toBe("transcode");
  });

  it("Android honors original only with a served file, never on data saver", () => {
    expect(
      resolveInitialTier("original", OFFERED_DV, false, "android-tv"),
    ).toBe("original");
    expect(resolveInitialTier("original", null, false, "android-tv")).toBe(
      "auto",
    );
    expect(
      resolveInitialTier("original", WITHHELD_NO_FILE, false, "android"),
    ).toBe("auto");
    expect(resolveInitialTier("original", OFFERED_DV, true, "android")).toBe(
      "auto",
    );
  });
});

describe("descentTierFor", () => {
  it("steps down one tier and bottoms out", () => {
    expect(descentTierFor("auto", "apple-tv")).toBe("transcode");
    expect(descentTierFor("transcode", "apple-tv")).toBeNull();
    expect(descentTierFor("original", "android-tv")).toBe("auto");
    expect(descentTierFor("auto", "android-tv")).toBeNull();
    expect(descentTierFor("original", "web")).toBeNull();
  });
});

describe("web platform class", () => {
  it("always opens on auto", () => {
    expect(resolveInitialTier("original", OFFERED_DV, false, "web")).toBe(
      "auto",
    );
  });
});
