import {
  deriveAudioFormatLabel,
  parseMasterAudioGroups,
} from "../hlsAudioFormats";

// Mirrors the transcoder's single-language shape: three full-quality codec
// groups plus a cellular-only mono group paired with the 144p rung.
const SINGLE_LANGUAGE_MASTER = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-INDEPENDENT-SEGMENTS

#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-aac",NAME="Audio",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2",URI="/a/aud-aac/Audio/index.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-ec3",NAME="Audio",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="6",URI="/a/aud-ec3/Audio/index.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-ac3",NAME="Audio",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="6",URI="/a/aud-ac3/Audio/index.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-aac-lo",NAME="Audio",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="1",URI="/a/aud-aac-lo/Audio/index.m3u8"

#EXT-X-STREAM-INF:BANDWIDTH=8944400,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",AUDIO="aud-aac"
/v/0/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1794400,RESOLUTION=854x480,CODECS="avc1.64001F,mp4a.40.2",AUDIO="aud-aac"
/v/2/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=9213200,RESOLUTION=1920x1080,CODECS="avc1.640028,ec-3",AUDIO="aud-ec3"
/v/0/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=9280400,RESOLUTION=1920x1080,CODECS="avc1.640028,ac-3",AUDIO="aud-ac3"
/v/0/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=182800,RESOLUTION=256x144,CODECS="avc1.64001E,mp4a.40.2",AUDIO="aud-aac-lo"
/v/4/index.m3u8
`;

describe("parseMasterAudioGroups", () => {
  const groups = parseMasterAudioGroups(SINGLE_LANGUAGE_MASTER);
  const byId = new Map(groups.map((g) => [g.groupId, g]));

  it("finds every referenced audio group", () => {
    expect(byId.size).toBe(4);
  });

  it("derives channels and codec per group", () => {
    expect(byId.get("aud-aac")).toMatchObject({
      channels: 2,
      audioCodec: "mp4a.40.2",
      label: "Stereo",
    });
    expect(byId.get("aud-ec3")).toMatchObject({
      channels: 6,
      audioCodec: "ec-3",
      label: "Dolby Digital+ 5.1",
    });
    expect(byId.get("aud-ac3")).toMatchObject({
      channels: 6,
      audioCodec: "ac-3",
      label: "Dolby Digital 5.1",
    });
  });

  it("marks only top-rung groups as selectable", () => {
    expect(byId.get("aud-aac")?.selectable).toBe(true);
    expect(byId.get("aud-ec3")?.selectable).toBe(true);
    expect(byId.get("aud-ac3")?.selectable).toBe(true);
    // The cellular-only group pairs with the 144p rung alone — selecting it
    // would pin video quality, so it must not be offered.
    expect(byId.get("aud-aac-lo")?.selectable).toBe(false);
  });

  it("keeps full-HD groups selectable when only one codec reaches the top rung", () => {
    // A 2160p title whose 2160p variants reference only aud-ec3, with aud-aac
    // topping out at 1080: an exact top-rung match would leave a single
    // option and hide the picker entirely.
    const master = `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-aac",NAME="Audio",LANGUAGE="en",CHANNELS="2",URI="/a1.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-ec3",NAME="Audio",LANGUAGE="en",CHANNELS="6",URI="/a2.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-aac-lo",NAME="Audio",LANGUAGE="en",CHANNELS="1",URI="/a3.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",AUDIO="aud-aac"
/v/1/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=22000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.90,ec-3",AUDIO="aud-ec3"
/v/0/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=182800,RESOLUTION=256x144,CODECS="avc1.64001E,mp4a.40.2",AUDIO="aud-aac-lo"
/v/4/index.m3u8
`;
    const parsed = new Map(
      parseMasterAudioGroups(master).map((g) => [g.groupId, g]),
    );
    expect(parsed.get("aud-ec3")?.selectable).toBe(true);
    expect(parsed.get("aud-aac")?.selectable).toBe(true);
    // The floor must still exclude the cellular-only group.
    expect(parsed.get("aud-aac-lo")?.selectable).toBe(false);
  });

  it("detects Atmos via the JOC channel marker", () => {
    const master = `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-atmos",NAME="Audio",LANGUAGE="en",CHANNELS="16/JOC",URI="/a.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=10000000,RESOLUTION=1920x1080,CODECS="avc1.640028,ec-3",AUDIO="aud-atmos"
/v/0/index.m3u8
`;
    expect(parseMasterAudioGroups(master)[0]).toMatchObject({
      joc: true,
      label: "Dolby Atmos",
    });
  });

  it("ignores unreferenced groups and non-audio media", () => {
    const master = `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="/s.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="orphan",NAME="Audio",LANGUAGE="en",CHANNELS="2",URI="/a.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720,CODECS="avc1.64001F"
/v/0/index.m3u8
`;
    expect(parseMasterAudioGroups(master)).toEqual([]);
  });

  it("handles multi-language groups (one member per language)", () => {
    const master = `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-aac",NAME="English",LANGUAGE="en",CHANNELS="2",URI="/en.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud-aac",NAME="Português",LANGUAGE="pt",CHANNELS="2",URI="/pt.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",AUDIO="aud-aac"
/v/0/index.m3u8
`;
    const parsed = parseMasterAudioGroups(master);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      groupId: "aud-aac",
      channels: 2,
      selectable: true,
    });
  });
});

describe("deriveAudioFormatLabel", () => {
  it("labels the common codec/channel combinations", () => {
    expect(deriveAudioFormatLabel("mp4a.40.2", 2, false)).toBe("Stereo");
    expect(deriveAudioFormatLabel("mp4a.40.2", 1, false)).toBe("Mono");
    expect(deriveAudioFormatLabel("mp4a.40.2", 6, false)).toBe("AAC 5.1");
    expect(deriveAudioFormatLabel("ec-3", 6, false)).toBe("Dolby Digital+ 5.1");
    expect(deriveAudioFormatLabel("ec-3", 8, false)).toBe("Dolby Digital+ 7.1");
    expect(deriveAudioFormatLabel("ec-3", 16, true)).toBe("Dolby Atmos");
    expect(deriveAudioFormatLabel("ac-3", 6, false)).toBe("Dolby Digital 5.1");
    expect(deriveAudioFormatLabel("opus", 2, false)).toBe("Opus Stereo");
  });

  it("degrades gracefully without metadata", () => {
    expect(deriveAudioFormatLabel(null, 6, false)).toBe("5.1");
    expect(deriveAudioFormatLabel(null, null, false)).toBe("Default");
  });
});
