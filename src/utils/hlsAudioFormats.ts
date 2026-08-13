// Parses an HLS master playlist for the audio-format metadata that
// expo-video's AudioTrack surface does not expose (CHANNELS per rendition
// group, audio codec per variant). Per RFC 8216 §4.3.4.1.1, audio groups of
// the same TYPE are multiple encodings of the same logical tracks — NAME and
// LANGUAGE are identical across groups, and only URI and CHANNELS may differ
// — so the format axis is derived entirely from GROUP-ID + CHANNELS + the
// referencing variants' CODECS, never from NAME.

export interface HlsAudioGroupInfo {
  groupId: string;
  // Max channel count across the group's members ("6/JOC" style values keep
  // their leading integer).
  channels: number | null;
  // True when any member's CHANNELS carries the JOC (Dolby Atmos) marker.
  joc: boolean;
  // Audio codec from the referencing variants' CODECS (e.g. "mp4a.40.2",
  // "ec-3", "ac-3").
  audioCodec: string | null;
  // True when this group serves the top video rung, or at least a full-HD
  // one. A bare "serves the top rung" test would hide the picker on any
  // master whose highest rung is served by a single codec group (e.g. a 2160p
  // title where only aud-ec3 reaches 2160 and aud-aac stops at 1080); the
  // floor keeps those selectable while still excluding cellular-only groups
  // that would pin playback to a 144p rung.
  selectable: boolean;
  // Human-readable format label, e.g. "Stereo", "Dolby Digital+ 5.1".
  label: string;
}

// Height at or above which a group counts as selectable even if it doesn't
// reach the playlist's very top rung.
const FULL_HD_HEIGHT_FLOOR = 720;

// Splits an HLS attribute list, respecting quoted values.
function parseAttributeList(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z0-9-]+)=("[^"]*"|[^,]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const key = match[1].toUpperCase();
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    attrs[key] = value;
  }
  return attrs;
}

const AUDIO_CODEC_PREFIXES = [
  "mp4a",
  "ec-3",
  "ac-3",
  "ac-4",
  "opus",
  "flac",
  "dts",
  "alac",
];

function audioCodecFromCodecsAttr(codecs: string | undefined): string | null {
  if (!codecs) return null;
  for (const entry of codecs.split(",")) {
    const trimmed = entry.trim().toLowerCase();
    if (AUDIO_CODEC_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
      return trimmed;
    }
  }
  return null;
}

// Maps a native sampleMimeType (patched expo-video only) onto the codec
// vocabulary deriveAudioFormatLabel understands, so labels are identical
// whether the metadata came from the player or from the master playlist.
export function codecFromSampleMimeType(
  sampleMimeType: string | null | undefined,
): string | null {
  if (!sampleMimeType) return null;
  const mime = sampleMimeType.toLowerCase();
  if (mime.includes("eac3-joc") || mime.includes("eac3")) return "ec-3";
  if (mime.includes("ac4")) return "ac-4";
  if (mime.includes("ac3")) return "ac-3";
  if (mime.includes("mp4a") || mime.includes("aac")) return "mp4a";
  if (mime.includes("opus")) return "opus";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("dts")) return "dts";
  if (mime.includes("alac")) return "alac";
  return null;
}

export function deriveAudioFormatLabel(
  audioCodec: string | null,
  channels: number | null,
  joc: boolean,
): string {
  const channelLabel =
    channels == null
      ? ""
      : channels >= 8
        ? "7.1"
        : channels >= 6
          ? "5.1"
          : channels === 1
            ? "Mono"
            : "Stereo";
  const codec = audioCodec ?? "";

  if (codec.startsWith("ec-3")) {
    return joc ? "Dolby Atmos" : `Dolby Digital+ ${channelLabel || "5.1"}`;
  }
  if (codec.startsWith("ac-3")) {
    return `Dolby Digital ${channelLabel || "5.1"}`;
  }
  if (codec.startsWith("ac-4")) {
    return joc ? "Dolby Atmos" : `Dolby AC-4 ${channelLabel || "5.1"}`;
  }
  if (codec.startsWith("mp4a") || codec.startsWith("alac")) {
    // AAC stereo/mono is the unremarkable default — plain "Stereo"/"Mono"
    // reads better than "AAC Stereo" on a consumer screen.
    if (channels != null && channels <= 2) return channelLabel;
    return `AAC ${channelLabel || "5.1"}`;
  }
  if (codec.startsWith("opus")) return `Opus ${channelLabel}`.trim();
  if (codec.startsWith("flac")) return `FLAC ${channelLabel}`.trim();
  if (codec.startsWith("dts")) return `DTS ${channelLabel}`.trim();
  return channelLabel || "Default";
}

// Parsed masters, keyed by URL. Small and bounded by how many sources one
// session plays; lets useAudioFallback read group metadata synchronously
// without a second fetch.
const audioGroupCache = new Map<string, HlsAudioGroupInfo[]>();

export function getCachedAudioGroups(
  url: string | null | undefined,
): HlsAudioGroupInfo[] | null {
  if (!url) return null;
  return audioGroupCache.get(url) ?? null;
}

export function cacheAudioGroups(
  url: string,
  groups: HlsAudioGroupInfo[],
): void {
  audioGroupCache.set(url, groups);
}

export function parseMasterAudioGroups(
  playlistText: string,
): HlsAudioGroupInfo[] {
  interface GroupAccumulator {
    channels: number | null;
    joc: boolean;
    audioCodec: string | null;
    maxHeight: number;
    maxBandwidth: number;
    referenced: boolean;
  }
  const groups = new Map<string, GroupAccumulator>();
  const getGroup = (groupId: string): GroupAccumulator => {
    let group = groups.get(groupId);
    if (!group) {
      group = {
        channels: null,
        joc: false,
        audioCodec: null,
        maxHeight: 0,
        maxBandwidth: 0,
        referenced: false,
      };
      groups.set(groupId, group);
    }
    return group;
  };

  let overallMaxHeight = 0;
  let overallMaxBandwidth = 0;

  for (const line of playlistText.split(/\r?\n/)) {
    if (line.startsWith("#EXT-X-MEDIA:")) {
      const attrs = parseAttributeList(line.slice("#EXT-X-MEDIA:".length));
      if (attrs["TYPE"] !== "AUDIO" || !attrs["GROUP-ID"]) continue;
      const group = getGroup(attrs["GROUP-ID"]);
      const channelsAttr = attrs["CHANNELS"];
      if (channelsAttr) {
        const count = parseInt(channelsAttr, 10);
        if (!isNaN(count)) {
          group.channels = Math.max(group.channels ?? 0, count);
        }
        if (channelsAttr.toUpperCase().includes("JOC")) {
          group.joc = true;
        }
      }
    } else if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const attrs = parseAttributeList(line.slice("#EXT-X-STREAM-INF:".length));
      const audioGroupId = attrs["AUDIO"];
      const bandwidth = parseInt(attrs["BANDWIDTH"] ?? "", 10) || 0;
      const height =
        parseInt(attrs["RESOLUTION"]?.split(/x/i)[1] ?? "", 10) || 0;
      overallMaxHeight = Math.max(overallMaxHeight, height);
      overallMaxBandwidth = Math.max(overallMaxBandwidth, bandwidth);
      if (!audioGroupId) continue;
      const group = getGroup(audioGroupId);
      group.referenced = true;
      group.maxHeight = Math.max(group.maxHeight, height);
      group.maxBandwidth = Math.max(group.maxBandwidth, bandwidth);
      group.audioCodec ??= audioCodecFromCodecsAttr(attrs["CODECS"]);
    }
  }

  const result: HlsAudioGroupInfo[] = [];
  for (const [groupId, group] of groups) {
    // A group nothing references can't be selected meaningfully; skip it.
    if (!group.referenced) continue;
    const selectable = overallMaxHeight
      ? group.maxHeight >= overallMaxHeight ||
        group.maxHeight >= FULL_HD_HEIGHT_FLOOR
      : group.maxBandwidth >= overallMaxBandwidth;
    result.push({
      groupId,
      channels: group.channels,
      joc: group.joc,
      audioCodec: group.audioCodec,
      selectable,
      label: deriveAudioFormatLabel(
        group.audioCodec,
        group.channels,
        group.joc,
      ),
    });
  }
  return result;
}
