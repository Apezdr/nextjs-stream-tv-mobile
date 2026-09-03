import {
  badgeLabel,
  deriveOriginalLabel,
  descentTierFor,
  describeActiveQuality,
  fileTierWithholdReason,
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

describe("fileTierWithholdReason (device-side veto over a served file)", () => {
  const MASTER = "https://t.example/stream/abc/master.m3u8";
  const served = (file: Partial<DirectPlayInfo["file"]>): DirectPlayInfo => ({
    hls: { offered: false, reason: "ineligible-source" },
    file: { available: true, ...file },
  });
  const P7 = served({ container: "mkv", dvProfile: 7 });
  const P8 = served({ container: "mkv", dvProfile: 8 });
  const SHIELD = { dolbyVisionProfiles: [4, 5, 8, 9] };

  it("withholds Dolby Vision profile 7 on Android before the probe answers", () => {
    expect(fileTierWithholdReason(P7, "android-tv")).toMatch(/profile 7/);
    expect(
      fileTierWithholdReason(P7, "android-tv", { dolbyVisionProfiles: null }),
    ).toMatch(/profile 7/);
    // Other profiles are not guessed at without a probe.
    expect(fileTierWithholdReason(P8, "android-tv")).toBeNull();
  });

  it("decides from the probe once it has answered", () => {
    expect(fileTierWithholdReason(P8, "android-tv", SHIELD)).toBeNull();
    expect(fileTierWithholdReason(P7, "android-tv", SHIELD)).toMatch(
      /profile 7/,
    );
    expect(
      fileTierWithholdReason(P7, "android-tv", { dolbyVisionProfiles: [7, 8] }),
    ).toBeNull();
    expect(
      fileTierWithholdReason(P8, "android-tv", { dolbyVisionProfiles: [4, 5] }),
    ).toMatch(/profile 8/);
    // A source without a DOVI record is never a DV question.
    expect(
      fileTierWithholdReason(served({ dvProfile: null }), "android-tv", SHIELD),
    ).toBeNull();
  });

  it("withholds an MP4 whose sample count exceeds the heap budget", () => {
    const fellowship = served({
      container: "mp4",
      sampleCount: 16_000_000,
      audioCodecs: ["truehd"],
    });
    expect(fileTierWithholdReason(fellowship, "android-tv")).toMatch(
      /index is too large/,
    );
    const dtsRemux = served({
      container: "mp4",
      sampleCount: 1_200_000,
      audioCodecs: ["dts"],
    });
    expect(fileTierWithholdReason(dtsRemux, "android-tv")).toBeNull();
    // Matroska has no whole-file sample table: the budget does not apply.
    expect(
      fileTierWithholdReason(
        served({ container: "mkv", sampleCount: 16_000_000 }),
        "android-tv",
      ),
    ).toBeNull();
  });

  it("falls back to the TrueHD-in-MP4 rule only when the sample count is unknown", () => {
    expect(
      fileTierWithholdReason(
        served({ container: "mp4", audioCodecs: ["truehd", "ac3"] }),
        "android-tv",
      ),
    ).toMatch(/TrueHD/);
    // A known count decides instead, either way.
    expect(
      fileTierWithholdReason(
        served({
          container: "mp4",
          audioCodecs: ["truehd"],
          sampleCount: 900_000,
        }),
        "android-tv",
      ),
    ).toBeNull();
    expect(
      fileTierWithholdReason(
        served({ container: "mkv", audioCodecs: ["truehd"] }),
        "android-tv",
      ),
    ).toBeNull();
    expect(
      fileTierWithholdReason(
        served({ container: "mp4", audioCodecs: ["eac3"] }),
        "android-tv",
      ),
    ).toBeNull();
  });

  it("never vetoes Apple, web, or an unserved file", () => {
    expect(fileTierWithholdReason(P7, "apple-tv", SHIELD)).toBeNull();
    expect(fileTierWithholdReason(P7, "ios")).toBeNull();
    expect(fileTierWithholdReason(P7, "web")).toBeNull();
    expect(
      fileTierWithholdReason(
        { ...P7, file: { ...P7.file, available: false } },
        "android-tv",
      ),
    ).toBeNull();
    expect(fileTierWithholdReason(null, "android-tv")).toBeNull();
  });

  it("threads into the menu rows, the source URL and the initial tier", () => {
    const rows = resolveAvailableTiers(P7, "android-tv", SHIELD);
    expect(rows).toEqual([
      { id: "auto", label: "Auto" },
      {
        id: "original",
        label: "Original",
        unavailableReason: expect.stringMatching(/profile 7/),
      },
    ]);
    expect(
      resolveTierSourceURL(MASTER, "original", P7, "android-tv", SHIELD),
    ).toBe(MASTER);
    expect(
      resolveInitialTier("original", P7, false, "android-tv", SHIELD),
    ).toBe("auto");
    // And a served, supported file still opens as before.
    expect(resolveAvailableTiers(P8, "android-tv", SHIELD)[1]).toEqual({
      id: "original",
      label: "Original (Direct Play)",
    });
    expect(
      resolveTierSourceURL(MASTER, "original", P8, "android-tv", SHIELD),
    ).toBe("https://t.example/stream/abc/file");
    expect(
      resolveInitialTier("original", P8, false, "android-tv", SHIELD),
    ).toBe("original");
  });
});

describe("describeActiveQuality (the chrome badge)", () => {
  const dvOffered: DirectPlayInfo = {
    hls: {
      offered: true,
      bandwidth: 72_000_000,
      averageBandwidth: 48_000_000,
      videoRange: "PQ",
      supplementalCodecs: "dvh1.08.06/db1p",
    },
    file: { available: true, container: "mkv" },
  };
  const uhdHdr = {
    size: { width: 3840, height: 1608 },
    videoRange: "pq",
    bitrate: 11_000_000,
    averageBitrate: 9_000_000,
  };
  const fhdSdr = {
    size: { width: 1920, height: 1080 },
    videoRange: "sdr",
    bitrate: 4_000_000,
    averageBitrate: 3_500_000,
  };

  it("says Original only when original bytes are playing (Android raw file)", () => {
    expect(
      describeActiveQuality({
        tier: "original",
        info: dvOffered,
        platformClass: "android-tv",
        videoTrack: uhdHdr,
      }),
    ).toBe("Original (Dolby Vision)");
    // The title offering Original does not make Auto read as Original.
    expect(
      describeActiveQuality({
        tier: "auto",
        info: dvOffered,
        platformClass: "android-tv",
        videoTrack: uhdHdr,
      }),
    ).toBe("Auto · 4K · HDR");
    expect(
      describeActiveQuality({
        tier: "auto",
        info: dvOffered,
        platformClass: "android-tv",
        videoTrack: fhdSdr,
      }),
    ).toBe("Auto · 1080p");
  });

  it("recognises the Original rung on Apple by its declared bandwidth", () => {
    const onOriginalRung = {
      ...uhdHdr,
      bitrate: 72_500_000,
      averageBitrate: 48_200_000,
    };
    expect(
      describeActiveQuality({
        tier: "auto",
        info: dvOffered,
        platformClass: "apple-tv",
        videoTrack: onOriginalRung,
      }),
    ).toBe("Original (Dolby Vision)");
    expect(
      describeActiveQuality({
        tier: "auto",
        info: dvOffered,
        platformClass: "apple-tv",
        videoTrack: uhdHdr,
      }),
    ).toBe("Auto · 4K · HDR");
    expect(
      describeActiveQuality({
        tier: "transcode",
        info: dvOffered,
        platformClass: "apple-tv",
        videoTrack: fhdSdr,
      }),
    ).toBe("Transcode · 1080p");
  });

  it("degrades gracefully without a track or verdict, and while switching", () => {
    expect(
      describeActiveQuality({
        tier: "auto",
        info: null,
        platformClass: "android-tv",
        videoTrack: null,
      }),
    ).toBe("Auto");
    expect(
      describeActiveQuality({
        tier: "original",
        info: null,
        platformClass: "android-tv",
        videoTrack: null,
      }),
    ).toBe("Original");
    expect(
      describeActiveQuality({
        tier: "auto",
        info: dvOffered,
        platformClass: "apple-tv",
        videoTrack: uhdHdr,
        isSwitching: true,
      }),
    ).toBe("Switching…");
    expect(
      describeActiveQuality({
        tier: "auto",
        info: dvOffered,
        platformClass: "web",
        videoTrack: { size: { width: 1280, height: 720 }, videoRange: "sdr" },
      }),
    ).toBe("Auto · 720p");
  });
});
