import {
  dolbyVisionPreference,
  dolbyVisionProfileOf,
  hasDolbyVisionPreference,
  allowsMixedCodecAdaptation,
  hdr10Capable,
  isFourKClass,
  isPQTransfer,
  nextRangeFallback,
  parseDimensions,
  rangeNegotiationFailure,
  resolveVideoRange,
  setSourcePolicy,
  videoSourceFor,
} from "@/src/utils/videoRange";

// The player user-agent is a device fact; tests run without one.
const mockPlayerUserAgent = jest.fn<string | null, []>(() => null);
jest.mock("@/src/utils/deviceInfo", () => ({
  ...jest.requireActual("@/src/utils/deviceInfo"),
  playerUserAgent: () => mockPlayerUserAgent(),
}));

const FEATURES = ["multi-language-audio", "master-video-range-filter-v1"];
const MASTER = "https://t.example.com/stream/abc/master.m3u8";

const base = {
  enabled: true,
  streamFeatures: FEATURES,
  transferCharacteristics: "",
  dimensions: "1920x1080",
  platformClass: "android-tv" as const,
  displayHdrTypes: [1, 2, 3] as number[] | null,
};

describe("parseDimensions / isFourKClass", () => {
  it("parses the server's WxH string, with either x", () => {
    expect(parseDimensions("3840x2160")).toEqual({ width: 3840, height: 2160 });
    expect(parseDimensions("3840 × 1608")).toEqual({
      width: 3840,
      height: 1608,
    });
    expect(parseDimensions("")).toBeNull();
    expect(parseDimensions(undefined)).toBeNull();
    expect(parseDimensions("0x0")).toBeNull();
  });

  it("calls a letterboxed 4K and a tall 4K source 4K-class, not 1080p", () => {
    expect(isFourKClass({ width: 3840, height: 1608 })).toBe(true);
    expect(isFourKClass({ width: 3600, height: 1500 })).toBe(true);
    expect(isFourKClass({ width: 2880, height: 2160 })).toBe(true);
    expect(isFourKClass({ width: 1920, height: 1080 })).toBe(false);
    expect(isFourKClass(null)).toBe(false);
  });
});

describe("isPQTransfer / hdr10Capable", () => {
  it("accepts PQ and SMPTE 2084 spellings only", () => {
    expect(isPQTransfer("PQ")).toBe(true);
    expect(isPQTransfer("SMPTE 2084")).toBe(true);
    expect(isPQTransfer("smpte2084")).toBe(true);
    expect(isPQTransfer("BT.709")).toBe(false);
    expect(isPQTransfer("")).toBe(false);
    expect(isPQTransfer(undefined)).toBe(false);
  });

  it("reads the display's HDR types", () => {
    expect(hdr10Capable([1, 2])).toBe(true);
    expect(hdr10Capable([4])).toBe(true);
    expect(hdr10Capable([3])).toBe(false);
    expect(hdr10Capable([])).toBe(false);
    expect(hdr10Capable(null)).toBeNull();
  });
});

describe("resolveVideoRange", () => {
  it("asks for sdr on an SDR title when the server advertises the filter", () => {
    expect(resolveVideoRange(base)).toBe("sdr");
  });

  it("sends nothing without the feature, with the toggle off, or off Android", () => {
    expect(
      resolveVideoRange({ ...base, streamFeatures: ["multi-language-audio"] }),
    ).toBeNull();
    expect(
      resolveVideoRange({ ...base, streamFeatures: undefined }),
    ).toBeNull();
    expect(resolveVideoRange({ ...base, enabled: false })).toBeNull();
    expect(
      resolveVideoRange({ ...base, platformClass: "apple-tv" }),
    ).toBeNull();
    expect(resolveVideoRange({ ...base, platformClass: "ios" })).toBeNull();
    expect(resolveVideoRange({ ...base, platformClass: "web" })).toBeNull();
  });

  it("asks for pq on a 4K PQ title on an HDR display", () => {
    expect(
      resolveVideoRange({
        ...base,
        transferCharacteristics: "PQ",
        dimensions: "3840x2160",
      }),
    ).toBe("pq");
    expect(
      resolveVideoRange({
        ...base,
        transferCharacteristics: "SMPTE 2084",
        dimensions: "3840x1608",
      }),
    ).toBe("pq");
  });

  it("asks for sdr on a PQ title the transcoder has no PQ ladder for, or on an SDR display", () => {
    expect(
      resolveVideoRange({
        ...base,
        transferCharacteristics: "PQ",
        dimensions: "1920x1080",
      }),
    ).toBe("sdr");
    expect(
      resolveVideoRange({
        ...base,
        transferCharacteristics: "PQ",
        dimensions: "3840x2160",
        displayHdrTypes: [],
      }),
    ).toBe("sdr");
  });

  it("keeps the unfiltered master for a 4K PQ title when the display is unknown", () => {
    expect(
      resolveVideoRange({
        ...base,
        transferCharacteristics: "PQ",
        dimensions: "3840x2160",
        displayHdrTypes: null,
      }),
    ).toBeNull();
  });
});

describe("nextRangeFallback", () => {
  it("walks pq → sdr → no range → nothing left", () => {
    expect(nextRangeFallback("pq")).toBe("sdr");
    expect(nextRangeFallback("sdr")).toBeNull();
    expect(nextRangeFallback(null)).toBeUndefined();
  });
});

describe("rangeNegotiationFailure", () => {
  const refused406 =
    "A playback exception has occurred: Response code: 406 [ERROR_CODE_IO_BAD_HTTP_STATUS] InvalidResponseCodeException: Response code: 406";
  const refused400 =
    "Source error [ERROR_CODE_IO_BAD_HTTP_STATUS] InvalidResponseCodeException: Response code: 400";

  it("downgrades a 406 or 400 on a ranged master", () => {
    expect(
      rangeNegotiationFailure(`${MASTER}?range=pq&direct=1`, refused406),
    ).toBe("downgrade");
    expect(rangeNegotiationFailure(`${MASTER}?range=sdr`, refused400)).toBe(
      "downgrade",
    );
  });

  it("ignores other errors and URLs without a range", () => {
    expect(
      rangeNegotiationFailure(`${MASTER}?direct=1`, refused406),
    ).toBeNull();
    expect(
      rangeNegotiationFailure(`${MASTER}?range=pq`, "Response code: 404"),
    ).toBeNull();
    expect(
      rangeNegotiationFailure(`${MASTER}?range=pq`, "Response code: 4060"),
    ).toBeNull();
    expect(
      rangeNegotiationFailure(
        "https://t.example.com/stream/abc/file",
        refused406,
      ),
    ).toBeNull();
    expect(rangeNegotiationFailure(null, refused406)).toBeNull();
  });
});

describe("videoSourceFor", () => {
  afterEach(() => {
    setSourcePolicy(`${MASTER}?range=pq&direct=1`, null);
  });

  it("switches mixed-codec adaptation on for an sdr master only", () => {
    expect(videoSourceFor(`${MASTER}?range=sdr&direct=1`)).toEqual({
      uri: `${MASTER}?range=sdr&direct=1`,
      allowMixedCodecAdaptation: true,
    });
    expect(videoSourceFor(`${MASTER}?range=sdr`)).toEqual({
      uri: `${MASTER}?range=sdr`,
      allowMixedCodecAdaptation: true,
    });
    expect(allowsMixedCodecAdaptation(`${MASTER}?range=sdr&direct=1`)).toBe(
      true,
    );
  });

  it("hands every other URL over exactly as today", () => {
    for (const url of [
      `${MASTER}?range=pq&direct=1`,
      `${MASTER}?direct=1`,
      MASTER,
      `${MASTER}?direct=only`,
      "https://t.example.com/stream/abc/file",
      "https://personalserver.example.com/clips/banner.mp4",
    ]) {
      expect(videoSourceFor(url)).toEqual({ uri: url });
      expect(allowsMixedCodecAdaptation(url)).toBe(false);
    }
  });

  it("carries a registered preferred-MIME policy for that URL only", () => {
    const pq = `${MASTER}?range=pq&direct=1`;
    setSourcePolicy(pq, { preferredVideoMimeTypes: ["video/dolby-vision"] });
    expect(videoSourceFor(pq)).toEqual({
      uri: pq,
      preferredVideoMimeTypes: ["video/dolby-vision"],
    });
    expect(videoSourceFor(`${MASTER}?direct=1`)).toEqual({
      uri: `${MASTER}?direct=1`,
    });
    setSourcePolicy(pq, null);
    expect(videoSourceFor(pq)).toEqual({ uri: pq });
  });
});

describe("videoSourceFor user-agent", () => {
  afterEach(() => mockPlayerUserAgent.mockReturnValue(null));

  it("names the device in the player's User-Agent when the platform has one", () => {
    mockPlayerUserAgent.mockReturnValue(
      "NextJS Stream TV/1.0.3 (Linux;Android 11; NVIDIA SHIELD Android TV; tv)",
    );
    expect(videoSourceFor(`${MASTER}?direct=1`)).toEqual({
      uri: `${MASTER}?direct=1`,
      headers: {
        "User-Agent":
          "NextJS Stream TV/1.0.3 (Linux;Android 11; NVIDIA SHIELD Android TV; tv)",
      },
    });
  });
});

describe("Dolby Vision preference", () => {
  const PQ = `${MASTER}?range=pq&direct=1`;
  const base = {
    url: PQ,
    originalOffered: true,
    supplementalCodecs: "dvh1.08.06/db1p",
    dolbyVisionProfiles: [4, 5, 8, 9],
    displayHdrTypes: [1, 2, 3],
  };

  afterEach(() => setSourcePolicy(PQ, null));

  it("parses the profile out of the DV codec string", () => {
    expect(dolbyVisionProfileOf("dvh1.08.06/db1p")).toBe(8);
    expect(dolbyVisionProfileOf("dvhe.05.06")).toBe(5);
    expect(dolbyVisionProfileOf("dvh1.08.06,ec-3")).toBe(8);
    expect(dolbyVisionProfileOf("hvc1.2.4.L153.B0")).toBeNull();
    expect(dolbyVisionProfileOf(undefined)).toBeNull();
    expect(dolbyVisionProfileOf("")).toBeNull();
  });

  it("prefers the DV rung on a pq master when display and decoder both take it", () => {
    expect(dolbyVisionPreference(base)).toEqual({
      preferredVideoMimeTypes: ["video/dolby-vision"],
    });
  });

  it("never applies off pq masters, on the pinned tiers, or without a DV Original", () => {
    expect(
      dolbyVisionPreference({ ...base, url: `${MASTER}?range=sdr&direct=1` }),
    ).toBeNull();
    expect(
      dolbyVisionPreference({ ...base, url: `${MASTER}?direct=1` }),
    ).toBeNull();
    expect(
      dolbyVisionPreference({ ...base, url: `${MASTER}?direct=only` }),
    ).toBeNull();
    expect(
      dolbyVisionPreference({ ...base, originalOffered: false }),
    ).toBeNull();
    expect(
      dolbyVisionPreference({ ...base, supplementalCodecs: undefined }),
    ).toBeNull();
  });

  it("needs a DV display and a decoder that advertises the profile", () => {
    expect(
      dolbyVisionPreference({ ...base, displayHdrTypes: [2, 3] }),
    ).toBeNull();
    expect(
      dolbyVisionPreference({ ...base, displayHdrTypes: null }),
    ).toBeNull();
    expect(
      dolbyVisionPreference({ ...base, dolbyVisionProfiles: [4, 5, 9] }),
    ).toBeNull();
    expect(
      dolbyVisionPreference({ ...base, dolbyVisionProfiles: null }),
    ).toBeNull();
    expect(
      dolbyVisionPreference({ ...base, supplementalCodecs: "dvhe.05.06" }),
    ).toEqual({
      preferredVideoMimeTypes: ["video/dolby-vision"],
    });
  });

  it("is visible to the fallback through the registry", () => {
    expect(hasDolbyVisionPreference(PQ)).toBe(false);
    setSourcePolicy(PQ, dolbyVisionPreference(base));
    expect(hasDolbyVisionPreference(PQ)).toBe(true);
    expect(videoSourceFor(PQ)).toEqual({
      uri: PQ,
      preferredVideoMimeTypes: ["video/dolby-vision"],
    });
    setSourcePolicy(PQ, null);
    expect(hasDolbyVisionPreference(PQ)).toBe(false);
    expect(hasDolbyVisionPreference(null)).toBe(false);
  });
});
