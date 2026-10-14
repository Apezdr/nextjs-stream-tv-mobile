// The video format a verdict describes, in the terms a decoder is asked
// about: MIME type, RFC 6381 codec string, size, frame rate, bit depth. Pure;
// the probe that answers lives in videoDiagnostics.ts.
//
// Two formats come out of one verdict: the raw file's video stream (the
// Direct Play tier) and the Original copy rung's (the `?direct=only` tier),
// which is the same stream re-packaged, so it shares the file's size and
// rate but carries its own codec string in `hls.codecs`.
import type { DirectPlayInfo } from "@/src/data/types/directPlay.types";

export interface VideoFormatSpec {
  mimeType: string;
  /** RFC 6381 string, e.g. "av01.0.12M.10"; null when only a codec name is known. */
  codecs: string | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  bitDepth: number | null;
}

// RFC 6381 sample-entry prefixes → Android MIME types. Audio prefixes map to
// null so a mixed "video,audio" list can be filtered to its video entry.
const RFC6381_PREFIX_TO_MIME: Record<string, string> = {
  avc1: "video/avc",
  avc3: "video/avc",
  hvc1: "video/hevc",
  hev1: "video/hevc",
  av01: "video/av01",
  vp09: "video/x-vnd.on2.vp9",
  vp08: "video/x-vnd.on2.vp8",
  dvh1: "video/dolby-vision",
  dvhe: "video/dolby-vision",
  dva1: "video/dolby-vision",
  dvav: "video/dolby-vision",
  mp4v: "video/mp4v-es",
};

// ffprobe/ffmpeg codec names (the verdict's older `file.videoCodec`).
const FFMPEG_NAME_TO_MIME: Record<string, string> = {
  h264: "video/avc",
  avc: "video/avc",
  hevc: "video/hevc",
  h265: "video/hevc",
  av1: "video/av01",
  vp9: "video/x-vnd.on2.vp9",
  vp8: "video/x-vnd.on2.vp8",
  mpeg4: "video/mp4v-es",
  mpeg2video: "video/mpeg2",
  vc1: "video/wvc1",
};

const MIME_DISPLAY_NAME: Record<string, string> = {
  "video/avc": "H.264",
  "video/hevc": "HEVC",
  "video/av01": "AV1",
  "video/x-vnd.on2.vp9": "VP9",
  "video/x-vnd.on2.vp8": "VP8",
  "video/dolby-vision": "Dolby Vision",
  "video/mp4v-es": "MPEG-4",
  "video/mpeg2": "MPEG-2",
  "video/wvc1": "VC-1",
};

/** The MIME type of an RFC 6381 codec string, or null for audio/unknown. */
export function rfc6381ToMime(codecs: string): string | null {
  const prefix = codecs.trim().toLowerCase().split(".")[0];
  return prefix ? (RFC6381_PREFIX_TO_MIME[prefix] ?? null) : null;
}

/** The MIME type of an ffmpeg codec name, or null when unknown. */
export function ffmpegCodecToMime(name: string): string | null {
  const key = name.trim().toLowerCase();
  return key ? (FFMPEG_NAME_TO_MIME[key] ?? null) : null;
}

/**
 * The first VIDEO codec string in a verdict field that may be one string,
 * a comma-joined list (HLS CODECS style) or an array. The server sends one
 * string in `file.videoCodecs` and "video,audio" in `hls.codecs`.
 */
export function firstVideoCodecString(
  value: string | string[] | null | undefined,
): string | null {
  if (!value) return null;
  const entries = Array.isArray(value) ? value : value.split(",");
  for (const entry of entries) {
    const trimmed = (entry ?? "").trim();
    if (trimmed && rfc6381ToMime(trimmed)) return trimmed;
  }
  return null;
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function specFrom(
  info: DirectPlayInfo,
  codecs: string | null,
  fallbackName: string | null | undefined,
): VideoFormatSpec | null {
  const mimeType = codecs
    ? rfc6381ToMime(codecs)
    : fallbackName
      ? ffmpegCodecToMime(fallbackName)
      : null;
  if (!mimeType) return null;
  const file = info.file;
  return {
    mimeType,
    codecs,
    width: positive(file?.width),
    height: positive(file?.height),
    frameRate: positive(file?.frameRate),
    bitDepth: positive(file?.bitDepth),
  };
}

/**
 * The formats a device must decode for each pinned tier of this title, or
 * null when the verdict does not say enough to ask (older server, unknown
 * codec, no Original offered).
 */
export function videoFormatOf(info: DirectPlayInfo | null | undefined): {
  file: VideoFormatSpec | null;
  original: VideoFormatSpec | null;
} {
  if (!info) return { file: null, original: null };
  const file = info.file?.available
    ? specFrom(
        info,
        firstVideoCodecString(info.file.videoCodecs),
        info.file.videoCodec,
      )
    : null;
  const original = info.hls?.offered
    ? specFrom(info, firstVideoCodecString(info.hls.codecs), null)
    : null;
  return { file, original };
}

/** "AV1 10-bit", "HEVC", "H.264" … for user-facing copy. */
export function codecDisplayName(spec: VideoFormatSpec): string {
  const base =
    MIME_DISPLAY_NAME[spec.mimeType] ??
    (spec.codecs ? spec.codecs.split(".")[0] : spec.mimeType);
  if (spec.bitDepth === 10 || spec.bitDepth === 12) {
    return `${base} ${spec.bitDepth}-bit`;
  }
  return base;
}

/** Cache key: one answer per MIME + codec string + size + rate. */
export function videoFormatKey(spec: VideoFormatSpec): string {
  return `${spec.mimeType}|${spec.codecs ?? "-"}|${spec.width ?? 0}x${spec.height ?? 0}@${spec.frameRate ?? 0}`;
}

/** The quality-menu reason when the device's decoder said no. */
export function deviceCannotDecodeCopy(spec: VideoFormatSpec): string {
  const size =
    spec.width && spec.height ? ` at ${spec.width}×${spec.height}` : "";
  return `This device can't decode ${codecDisplayName(spec)} video${size}.`;
}
