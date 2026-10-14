import type { DirectPlayInfo } from "@/src/data/types/directPlay.types";
import {
  codecDisplayName,
  deviceCannotDecodeCopy,
  ffmpegCodecToMime,
  firstVideoCodecString,
  rfc6381ToMime,
  videoFormatKey,
  videoFormatOf,
} from "@/src/utils/videoFormat";

// Dexter S01E01 as the live transcoder answered it on 2026-10-14.
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
    audioCodecs: ["dts"],
  },
};

// American Dad S15E01: H.264 1080p with the Original rung offered.
const AMERICAN_DAD: DirectPlayInfo = {
  hls: {
    offered: true,
    codecs: "avc1.640028",
    bandwidth: 13904123,
    averageBandwidth: 5582518,
    videoRange: "SDR",
  },
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

describe("rfc6381ToMime", () => {
  it("maps the common video sample entries", () => {
    expect(rfc6381ToMime("av01.0.12M.10")).toBe("video/av01");
    expect(rfc6381ToMime("avc1.640028")).toBe("video/avc");
    expect(rfc6381ToMime("avc3.64001F")).toBe("video/avc");
    expect(rfc6381ToMime("hvc1.2.4.L153.B0")).toBe("video/hevc");
    expect(rfc6381ToMime("hev1.1.6.L153.90")).toBe("video/hevc");
    expect(rfc6381ToMime("dvh1.08.06")).toBe("video/dolby-vision");
    expect(rfc6381ToMime("vp09.00.10.08")).toBe("video/x-vnd.on2.vp9");
    expect(rfc6381ToMime(" HVC1.1.6.L153.90 ")).toBe("video/hevc");
  });

  it("answers null for audio and unknown prefixes", () => {
    expect(rfc6381ToMime("mp4a.40.2")).toBeNull();
    expect(rfc6381ToMime("ec-3")).toBeNull();
    expect(rfc6381ToMime("vvc1.1.1")).toBeNull();
    expect(rfc6381ToMime("")).toBeNull();
  });
});

describe("ffmpegCodecToMime", () => {
  it("maps ffprobe names", () => {
    expect(ffmpegCodecToMime("h264")).toBe("video/avc");
    expect(ffmpegCodecToMime("hevc")).toBe("video/hevc");
    expect(ffmpegCodecToMime("av1")).toBe("video/av01");
    expect(ffmpegCodecToMime("mpeg2video")).toBe("video/mpeg2");
    expect(ffmpegCodecToMime("prores")).toBeNull();
  });
});

describe("firstVideoCodecString", () => {
  it("takes the one string the server sends", () => {
    expect(firstVideoCodecString("av01.0.12M.10")).toBe("av01.0.12M.10");
  });

  it("skips audio entries in an array or a comma list", () => {
    expect(firstVideoCodecString(["mp4a.40.2", "avc1.640028"])).toBe(
      "avc1.640028",
    );
    expect(firstVideoCodecString("ec-3, hvc1.2.4.L153.B0")).toBe(
      "hvc1.2.4.L153.B0",
    );
  });

  it("answers null when nothing is a video codec", () => {
    expect(firstVideoCodecString(["mp4a.40.2"])).toBeNull();
    expect(firstVideoCodecString(undefined)).toBeNull();
    expect(firstVideoCodecString("")).toBeNull();
  });
});

describe("videoFormatOf", () => {
  it("describes the raw file from the exact fields", () => {
    expect(videoFormatOf(DEXTER).file).toEqual({
      mimeType: "video/av01",
      codecs: "av01.0.12M.10",
      width: 3840,
      height: 2160,
      frameRate: 23.976,
      bitDepth: 10,
    });
  });

  it("has no Original format when the rung is withheld", () => {
    expect(videoFormatOf(DEXTER).original).toBeNull();
  });

  it("describes the Original rung from hls.codecs with the file's size", () => {
    expect(videoFormatOf(AMERICAN_DAD).original).toEqual({
      mimeType: "video/avc",
      codecs: "avc1.640028",
      width: 1920,
      height: 1080,
      frameRate: 23.976,
      bitDepth: 8,
    });
  });

  it("falls back to the ffmpeg codec name from an older server", () => {
    const older: DirectPlayInfo = {
      hls: { offered: false, reason: "ineligible-source" },
      file: { available: true, container: "mkv", videoCodec: "h264" },
    };
    expect(videoFormatOf(older).file).toEqual({
      mimeType: "video/avc",
      codecs: null,
      width: null,
      height: null,
      frameRate: null,
      bitDepth: null,
    });
  });

  it("is null when nothing identifies the codec, when the file is not served, or without a verdict", () => {
    const unknown: DirectPlayInfo = {
      hls: { offered: false },
      file: { available: true, videoCodec: "prores" },
    };
    expect(videoFormatOf(unknown).file).toBeNull();
    const notServed: DirectPlayInfo = {
      hls: { offered: false },
      file: { available: false, videoCodecs: "av01.0.12M.10" },
    };
    expect(videoFormatOf(notServed).file).toBeNull();
    expect(videoFormatOf(null)).toEqual({ file: null, original: null });
  });
});

describe("copy and keys", () => {
  it("names the codec with its bit depth", () => {
    const spec = videoFormatOf(DEXTER).file;
    expect(spec).not.toBeNull();
    if (!spec) return;
    expect(codecDisplayName(spec)).toBe("AV1 10-bit");
    expect(deviceCannotDecodeCopy(spec)).toBe(
      "This device can't decode AV1 10-bit video at 3840×2160.",
    );
  });

  it("drops the size when the verdict carries none", () => {
    expect(
      deviceCannotDecodeCopy({
        mimeType: "video/hevc",
        codecs: null,
        width: null,
        height: null,
        frameRate: null,
        bitDepth: null,
      }),
    ).toBe("This device can't decode HEVC video.");
  });

  it("keys one answer per format", () => {
    const spec = videoFormatOf(DEXTER).file;
    expect(spec && videoFormatKey(spec)).toBe(
      "video/av01|av01.0.12M.10|3840x2160@23.976",
    );
  });
});
