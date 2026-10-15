import {
  badgeLabel,
  deriveOriginalLabel,
  descentTierFor,
  describeActiveQuality,
  fileTierWithholdReason,
  globalDefaultOptions,
  originalUsable,
  originalWithholdReason,
  tierUsable,
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

const PINNED_DV: DirectPlayInfo = {
  ...OFFERED_DV,
  // The `original` block ships in the same deploy as ?direct=only: its
  // presence is what makes the pinned tier requestable.
  original: { audio: [{ groupId: "aud-ec3", language: "en", channels: 6 }] },
};

const AUTO_ROW = {
  id: "auto",
  label: "Auto",
  description: expect.stringMatching(/Adapts/),
};
const ORIGINAL_ROW = {
  id: "original",
  label: "Original",
  description: expect.stringMatching(/pinned/),
};
const DIRECT_PLAY_ROW = {
  id: "directplay",
  label: "Direct Play",
  description: expect.stringMatching(/untouched file/),
};
const TRANSCODE_ROW = {
  id: "transcode",
  label: "Transcoded only",
  description: expect.stringMatching(/ladder/),
};

describe("resolveAvailableTiers", () => {
  it("shows Auto and Transcoded only while the verdict is loading", () => {
    for (const platform of ["apple-tv", "ios", "android-tv"] as const) {
      expect(resolveAvailableTiers(null, platform)).toEqual([
        AUTO_ROW,
        TRANSCODE_ROW,
      ]);
    }
  });

  it("offers the pinned Original on both platforms once the server supports it", () => {
    expect(resolveAvailableTiers(PINNED_DV, "apple-tv")).toEqual([
      AUTO_ROW,
      ORIGINAL_ROW,
      TRANSCODE_ROW,
    ]);
    expect(resolveAvailableTiers(PINNED_DV, "android-tv")).toEqual([
      AUTO_ROW,
      ORIGINAL_ROW,
      DIRECT_PLAY_ROW,
      TRANSCODE_ROW,
    ]);
  });

  it("treats an offered rung from a server without ?direct=only as absent", () => {
    // Pre-deploy server: offered, but no `original` block. Never request a
    // master the server would misinterpret; the menu simply lacks Original.
    expect(resolveAvailableTiers(OFFERED_DV, "apple-tv")).toEqual([
      AUTO_ROW,
      TRANSCODE_ROW,
    ]);
    expect(resolveAvailableTiers(OFFERED_DV, "android-tv")).toEqual([
      AUTO_ROW,
      DIRECT_PLAY_ROW,
      TRANSCODE_ROW,
    ]);
  });

  it("keeps Direct Play as the Android escape hatch when HLS-Original is withheld", () => {
    expect(resolveAvailableTiers(WITHHELD_OPEN_GOP, "android")).toEqual([
      AUTO_ROW,
      {
        id: "original",
        label: "Original",
        unavailableReason: expect.stringMatching(/processing/),
      },
      DIRECT_PLAY_ROW,
      TRANSCODE_ROW,
    ]);
    // Apple has no raw-file tier: the withheld row explains, nothing else.
    expect(resolveAvailableTiers(WITHHELD_OPEN_GOP, "ios")).toEqual([
      AUTO_ROW,
      {
        id: "original",
        label: "Original",
        unavailableReason: expect.stringMatching(/processing/),
      },
      TRANSCODE_ROW,
    ]);
  });

  it("renders an unavailable Original row with reason copy when nothing serves it", () => {
    const tiers = resolveAvailableTiers(WITHHELD_NO_FILE, "android-tv");
    expect(tiers.map((t) => t.id)).toEqual(["auto", "original", "transcode"]);
    expect(tiers[1].unavailableReason).toMatch(/analyzed/);
    expect(
      resolveAvailableTiers(
        { ...WITHHELD_NO_FILE, reasonCopy: "Server says no." },
        "android-tv",
      )[1].unavailableReason,
    ).toBe("Server says no.");
  });

  it("hides Original when the server feature is off or the verdict is the 404 sentinel", () => {
    expect(resolveAvailableTiers(DISABLED, "android-tv")).toEqual([
      AUTO_ROW,
      TRANSCODE_ROW,
    ]);
    expect(
      resolveAvailableTiers(
        { hls: { offered: false }, file: { available: false } },
        "apple-tv",
      ),
    ).toEqual([AUTO_ROW, TRANSCODE_ROW]);
  });

  it("web builds only ever get Auto", () => {
    expect(resolveAvailableTiers(PINNED_DV, "web")).toEqual([AUTO_ROW]);
  });
});

const MASTER = "https://t.example.com/stream/abc/master.m3u8";

describe("resolveTierSourceURL", () => {
  it("Auto is the ?direct=1 master on both platforms, Transcoded only the default master", () => {
    expect(resolveTierSourceURL(MASTER, "auto", PINNED_DV, "apple-tv")).toBe(
      `${MASTER}?direct=1`,
    );
    expect(resolveTierSourceURL(MASTER, "auto", null, "android-tv")).toBe(
      `${MASTER}?direct=1`,
    );
    expect(
      resolveTierSourceURL(
        `${MASTER}?direct=1`,
        "transcode",
        PINNED_DV,
        "apple-tv",
      ),
    ).toBe(MASTER);
    expect(
      resolveTierSourceURL(
        `${MASTER}?direct=only`,
        "transcode",
        PINNED_DV,
        "android",
      ),
    ).toBe(MASTER);
  });

  it("Original is the pinned master only when the server supports it", () => {
    expect(resolveTierSourceURL(MASTER, "original", PINNED_DV, "ios")).toBe(
      `${MASTER}?direct=only`,
    );
    expect(
      resolveTierSourceURL(MASTER, "original", PINNED_DV, "android-tv"),
    ).toBe(`${MASTER}?direct=only`);
    // Offered by a pre-deploy server, or withheld: behaves as Auto, never a lying URL.
    expect(
      resolveTierSourceURL(MASTER, "original", OFFERED_DV, "apple-tv"),
    ).toBe(`${MASTER}?direct=1`);
    expect(
      resolveTierSourceURL(MASTER, "original", WITHHELD_NO_FILE, "android-tv"),
    ).toBe(`${MASTER}?direct=1`);
  });

  it("Direct Play is the raw file only when served and not vetoed, Android only", () => {
    expect(
      resolveTierSourceURL(MASTER, "directplay", PINNED_DV, "android-tv"),
    ).toBe("https://t.example.com/stream/abc/file");
    expect(
      resolveTierSourceURL(MASTER, "directplay", WITHHELD_OPEN_GOP, "android"),
    ).toBe("https://t.example.com/stream/abc/file");
    expect(
      resolveTierSourceURL(
        MASTER,
        "directplay",
        WITHHELD_NO_FILE,
        "android-tv",
      ),
    ).toBe(`${MASTER}?direct=1`);
    expect(
      resolveTierSourceURL(MASTER, "directplay", PINNED_DV, "apple-tv"),
    ).toBe(`${MASTER}?direct=1`);
  });

  it("web always resolves to the default master", () => {
    expect(
      resolveTierSourceURL(`${MASTER}?direct=1`, "original", PINNED_DV, "web"),
    ).toBe(MASTER);
    expect(resolveTierSourceURL(MASTER, "auto", PINNED_DV, "web")).toBe(MASTER);
  });
});

describe("resolveInitialTier", () => {
  it("honors Auto and Transcoded only, and data saver forces the ladder", () => {
    expect(resolveInitialTier("auto", null, false, "apple-tv")).toBe("auto");
    expect(resolveInitialTier("transcode", null, false, "android-tv")).toBe(
      "transcode",
    );
    expect(resolveInitialTier("auto", PINNED_DV, true, "ios")).toBe(
      "transcode",
    );
    expect(resolveInitialTier("original", PINNED_DV, true, "android")).toBe(
      "transcode",
    );
  });

  it("opens the pinned Original only when the server supports it", () => {
    expect(resolveInitialTier("original", PINNED_DV, false, "ios")).toBe(
      "original",
    );
    expect(resolveInitialTier("original", PINNED_DV, false, "android-tv")).toBe(
      "original",
    );
    expect(resolveInitialTier("original", OFFERED_DV, false, "apple-tv")).toBe(
      "auto",
    );
    expect(resolveInitialTier("original", null, false, "android-tv")).toBe(
      "auto",
    );
  });

  it("opens Direct Play when usable, else the nearest tier that works", () => {
    expect(
      resolveInitialTier("directplay", PINNED_DV, false, "android-tv"),
    ).toBe("directplay");
    // Vetoed file, pinned Original available: land there.
    const vetoed: DirectPlayInfo = {
      ...PINNED_DV,
      file: { available: true, container: "mkv", dvProfile: 7 },
    };
    expect(resolveInitialTier("directplay", vetoed, false, "android-tv")).toBe(
      "original",
    );
    expect(
      resolveInitialTier("directplay", WITHHELD_NO_FILE, false, "android"),
    ).toBe("auto");
    expect(resolveInitialTier("directplay", PINNED_DV, false, "apple-tv")).toBe(
      "original",
    );
  });

  it("web always opens on auto", () => {
    expect(resolveInitialTier("original", PINNED_DV, false, "web")).toBe(
      "auto",
    );
  });
});

describe("descentTierFor", () => {
  it("ends on the ladder so ABR cannot climb back into a failed rung", () => {
    expect(descentTierFor("directplay", "android-tv", PINNED_DV)).toBe(
      "original",
    );
    expect(descentTierFor("directplay", "android-tv", OFFERED_DV)).toBe(
      "transcode",
    );
    expect(descentTierFor("original", "apple-tv", PINNED_DV)).toBe("transcode");
    expect(descentTierFor("auto", "android-tv", PINNED_DV)).toBe("transcode");
    expect(descentTierFor("transcode", "apple-tv", PINNED_DV)).toBeNull();
    expect(descentTierFor("original", "web", PINNED_DV)).toBeNull();
  });
});

describe("globalDefaultOptions", () => {
  it("offers the tiers each platform can honor", () => {
    expect(globalDefaultOptions("apple-tv").map((o) => o.id)).toEqual([
      "auto",
      "original",
      "transcode",
    ]);
    expect(globalDefaultOptions("android-tv").map((o) => o.id)).toEqual([
      "auto",
      "original",
      "directplay",
      "transcode",
    ]);
    expect(globalDefaultOptions("web").map((o) => o.id)).toEqual(["auto"]);
    expect(
      globalDefaultOptions("android").every((o) => o.description.length > 0),
    ).toBe(true);
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

  it("threads into the Direct Play row, the source URL and the initial tier", () => {
    const rows = resolveAvailableTiers(P7, "android-tv", SHIELD);
    expect(rows.map((r) => r.id)).toEqual([
      "auto",
      "original",
      "directplay",
      "transcode",
    ]);
    expect(rows[2]).toEqual({
      id: "directplay",
      label: "Direct Play",
      unavailableReason: expect.stringMatching(/profile 7/),
    });
    expect(
      resolveTierSourceURL(MASTER, "directplay", P7, "android-tv", SHIELD),
    ).toBe(`${MASTER}?direct=1`);
    expect(
      resolveInitialTier("directplay", P7, false, "android-tv", SHIELD),
    ).toBe("auto");
    // And a served, supported file still opens as before.
    expect(resolveAvailableTiers(P8, "android-tv", SHIELD)[2]).toEqual({
      id: "directplay",
      label: "Direct Play",
      description: expect.stringMatching(/untouched file/),
    });
    expect(
      resolveTierSourceURL(MASTER, "directplay", P8, "android-tv", SHIELD),
    ).toBe("https://t.example/stream/abc/file");
    expect(
      resolveInitialTier("directplay", P8, false, "android-tv", SHIELD),
    ).toBe("directplay");
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
  const onOriginalRung = {
    ...uhdHdr,
    bitrate: 72_500_000,
    averageBitrate: 48_200_000,
  };

  it("names the pinned tiers by what they play", () => {
    expect(
      describeActiveQuality({
        tier: "directplay",
        info: dvOffered,
        platformClass: "android-tv",
        videoTrack: uhdHdr,
      }),
    ).toBe("Direct Play (Dolby Vision)");
    expect(
      describeActiveQuality({
        tier: "original",
        info: dvOffered,
        platformClass: "apple-tv",
        videoTrack: uhdHdr,
      }),
    ).toBe("Original (Dolby Vision)");
    expect(
      describeActiveQuality({
        tier: "transcode",
        info: dvOffered,
        platformClass: "apple-tv",
        videoTrack: fhdSdr,
      }),
    ).toBe("Transcode · 1080p");
  });

  it("recognises the copy rung by the peak and average the master declares (Widow's Bay on the SHIELD)", () => {
    const widowsBay: DirectPlayInfo = {
      hls: {
        offered: true,
        bandwidth: 33_917_101,
        averageBandwidth: 24_786_855,
        videoRange: "PQ",
        supplementalCodecs: "dvh1.08.06/db1p",
      },
      file: { available: true, container: "mp4" },
    };
    // expo-video's `bitrate` is the average when one is known.
    const dvRung = {
      size: { width: 3840, height: 2076 },
      videoRange: "PQ",
      bitrate: 24_914_855,
      averageBitrate: 24_914_855,
      peakBitrate: 34_051_501,
    };
    const hevcRung = {
      size: { width: 3840, height: 2076 },
      videoRange: "PQ",
      bitrate: 19_128_000,
      averageBitrate: 19_128_000,
      peakBitrate: 22_144_400,
    };
    expect(
      describeActiveQuality({
        tier: "auto",
        info: widowsBay,
        platformClass: "android-tv",
        videoTrack: dvRung,
      }),
    ).toBe("Original (Dolby Vision)");
    expect(
      describeActiveQuality({
        tier: "auto",
        info: widowsBay,
        platformClass: "android-tv",
        videoTrack: hevcRung,
      }),
    ).toBe("Auto · 4K · HDR");
  });

  it("on Auto says Original only when ABR is on the copy rung, on either platform", () => {
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
        platformClass: "android-tv",
        videoTrack: onOriginalRung,
      }),
    ).toBe("Original (Dolby Vision)");
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
        platformClass: "apple-tv",
        videoTrack: fhdSdr,
      }),
    ).toBe("Auto · 1080p");
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
        tier: "directplay",
        info: null,
        platformClass: "android-tv",
        videoTrack: null,
      }),
    ).toBe("Direct Play");
    expect(
      describeActiveQuality({
        tier: "original",
        info: null,
        platformClass: "ios",
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
        tier: "original",
        info: dvOffered,
        platformClass: "web",
        videoTrack: { size: { width: 1280, height: 720 }, videoRange: "sdr" },
      }),
    ).toBe("Auto · 720p");
  });
});

// ── Device-side codec gate (2026-10-14): the decoder's own answer on the
// verdict's exact format vetoes the pinned tiers; a codec name never does.
describe("device codec gate", () => {
  const MASTER = "https://t.example.com/stream/abc/master.m3u8";
  const DEXTER: DirectPlayInfo = {
    hls: { offered: false, reason: "codec-unsupported" },
    file: {
      available: true,
      container: "mkv",
      videoCodec: "av1",
      videoCodecs: "av01.0.12M.10",
      width: 3840,
      height: 2160,
      frameRate: 23.976,
      bitDepth: 10,
    },
  };
  const AVC_OFFERED: DirectPlayInfo = {
    hls: { offered: true, codecs: "avc1.640028", videoRange: "SDR" },
    file: {
      available: true,
      container: "mp4",
      videoCodec: "h264",
      videoCodecs: "avc1.640028",
      width: 1920,
      height: 1080,
      frameRate: 23.976,
      bitDepth: 8,
    },
    original: { audio: [] },
  };
  const DEVICE_COPY = "This device can't decode AV1 10-bit video at 3840×2160.";

  it("withholds Direct Play when the device has no decoder, or one that cannot take the format", () => {
    for (const answer of ["unsupported", "exceeds"] as const) {
      expect(
        fileTierWithholdReason(DEXTER, "android-tv", {
          fileVideoSupport: answer,
        }),
      ).toBe(DEVICE_COPY);
      expect(
        resolveInitialTier("directplay", DEXTER, false, "android-tv", {
          fileVideoSupport: answer,
        }),
      ).toBe("auto");
    }
  });

  it("keeps Direct Play on every answer that is not a refusal", () => {
    for (const answer of [
      "hardware",
      "software",
      "unknown",
      undefined,
    ] as const) {
      expect(
        fileTierWithholdReason(DEXTER, "android-tv", {
          fileVideoSupport: answer,
        }),
      ).toBeNull();
    }
    expect(fileTierWithholdReason(DEXTER, "android-tv", null)).toBeNull();
  });

  it("renders the greyed Direct Play row with the device's reason and the Original row with the server's", () => {
    const rows = resolveAvailableTiers(DEXTER, "android-tv", {
      fileVideoSupport: "unsupported",
    });
    expect(rows.map((r) => r.id)).toEqual([
      "auto",
      "original",
      "directplay",
      "transcode",
    ]);
    expect(rows[1].unavailableReason).toBe(
      "This file's video codec can't be streamed unmodified.",
    );
    expect(rows[2].unavailableReason).toBe(DEVICE_COPY);
  });

  it("vetoes the offered Original rung by the same answer, keeping the row greyed", () => {
    const caps = { originalVideoSupport: "unsupported" as const };
    expect(originalWithholdReason(AVC_OFFERED, "android-tv", caps)).toBe(
      "This device can't decode H.264 video at 1920×1080.",
    );
    expect(originalUsable(AVC_OFFERED, "android-tv", caps)).toBe(false);
    expect(tierUsable("original", AVC_OFFERED, "android-tv", caps)).toBe(false);
    const rows = resolveAvailableTiers(AVC_OFFERED, "android-tv", caps);
    expect(rows[1]).toMatchObject({
      id: "original",
      unavailableReason: "This device can't decode H.264 video at 1920×1080.",
    });
    expect(
      resolveInitialTier("original", AVC_OFFERED, false, "android-tv", caps),
    ).toBe("auto");
    expect(
      resolveTierSourceURL(MASTER, "original", AVC_OFFERED, "android-tv", caps),
    ).toBe(`${MASTER}?direct=1`);
  });

  it("leaves the Original rung alone when the device accepts it or cannot say", () => {
    for (const answer of [
      "hardware",
      "software",
      "unknown",
      undefined,
    ] as const) {
      const caps = { originalVideoSupport: answer };
      expect(
        originalWithholdReason(AVC_OFFERED, "android-tv", caps),
      ).toBeNull();
      expect(originalUsable(AVC_OFFERED, "android-tv", caps)).toBe(true);
      expect(
        resolveAvailableTiers(AVC_OFFERED, "android-tv", caps)[1],
      ).toMatchObject({
        id: "original",
        description: expect.stringMatching(/pinned/i),
      });
    }
  });

  it("never applies on Apple platforms, where the probe cannot be asked", () => {
    const caps = {
      fileVideoSupport: "unsupported" as const,
      originalVideoSupport: "unsupported" as const,
    };
    expect(originalWithholdReason(AVC_OFFERED, "apple-tv", caps)).toBeNull();
    expect(fileTierWithholdReason(DEXTER, "apple-tv", caps)).toBeNull();
    expect(
      resolveAvailableTiers(AVC_OFFERED, "apple-tv", caps).map((r) => r.id),
    ).toEqual(["auto", "original", "transcode"]);
  });

  it("descends from a vetoed Direct Play straight to the ladder, never into the same codec's copy rung", () => {
    const caps = {
      fileVideoSupport: "unsupported" as const,
      originalVideoSupport: "unsupported" as const,
    };
    expect(descentTierFor("directplay", "android-tv", AVC_OFFERED, caps)).toBe(
      "transcode",
    );
    expect(
      descentTierFor("directplay", "android-tv", AVC_OFFERED, {
        fileVideoSupport: "hardware",
      }),
    ).toBe("original");
  });

  it("maps the new server reason and keeps the enriched copy first", () => {
    expect(reasonToUserCopy("codec-unsupported")).toBe(
      "This file's video codec can't be streamed unmodified.",
    );
    const enriched: DirectPlayInfo = {
      ...DEXTER,
      reasonCopy: "Server says no.",
    };
    expect(
      resolveAvailableTiers(enriched, "android-tv")[1].unavailableReason,
    ).toBe("Server says no.");
  });
});

// ── Range-filtered ABR masters: only the ABR tiers carry `range`, only on
// Android, written before `direct` so one selection has one spelling.
describe("resolveTierSourceURL with a range", () => {
  const MASTER = "https://t.example.com/stream/abc/master.m3u8";
  const OFFERED: DirectPlayInfo = {
    hls: { offered: true, codecs: "hvc1.1.6.L153.90" },
    file: { available: true, container: "mkv", videoCodec: "hevc" },
    original: { audio: [] },
  };

  it("adds the range to Auto and Transcoded only", () => {
    expect(
      resolveTierSourceURL(MASTER, "auto", OFFERED, "android-tv", null, "sdr"),
    ).toBe(`${MASTER}?range=sdr&direct=1`);
    expect(
      resolveTierSourceURL(
        MASTER,
        "transcode",
        OFFERED,
        "android-tv",
        null,
        "pq",
      ),
    ).toBe(`${MASTER}?range=pq`);
    expect(
      resolveTierSourceURL(
        `${MASTER}?token=x`,
        "auto",
        OFFERED,
        "android",
        null,
        "sdr",
      ),
    ).toBe(`${MASTER}?token=x&range=sdr&direct=1`);
  });

  it("never puts a range on the pinned tiers", () => {
    expect(
      resolveTierSourceURL(
        MASTER,
        "original",
        OFFERED,
        "android-tv",
        null,
        "pq",
      ),
    ).toBe(`${MASTER}?direct=only`);
    expect(
      resolveTierSourceURL(
        MASTER,
        "directplay",
        OFFERED,
        "android-tv",
        null,
        "sdr",
      ),
    ).toBe("https://t.example.com/stream/abc/file");
  });

  it("ignores the range off Android and when none was resolved", () => {
    expect(
      resolveTierSourceURL(MASTER, "auto", OFFERED, "apple-tv", null, "pq"),
    ).toBe(`${MASTER}?direct=1`);
    expect(
      resolveTierSourceURL(MASTER, "auto", OFFERED, "web", null, "pq"),
    ).toBe(MASTER);
    expect(
      resolveTierSourceURL(MASTER, "auto", OFFERED, "android-tv", null, null),
    ).toBe(`${MASTER}?direct=1`);
    expect(resolveTierSourceURL(MASTER, "auto", OFFERED, "android-tv")).toBe(
      `${MASTER}?direct=1`,
    );
  });
});
