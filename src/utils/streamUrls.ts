// Tier-URL derivation for the delivery-tiers server contract
// (FRONTEND_PLAYBACK_REQUIREMENTS.md). The server hands the app one opaque
// `videoURL` shaped `…/stream/<key>/master.m3u8[?query]` and can rotate it at
// any time, so tier siblings (`?direct=1`, `/file`) are derived from the
// current URL by string surgery and never stored. The app owns two query
// controls on a stream URL: `direct` (the delivery tier) and `range`
// (`pq` | `sdr`, a master filtered to one dynamic range). Every other param
// may be server-issued (tokens) and must round-trip byte-for-byte, which is
// why this avoids URLSearchParams re-encoding.
//
// The controls are independent on the ABR masters — Auto and Transcoded only
// keep whatever `range` is selected — but the source-preserving tiers never
// carry one: the pinned Original master and the raw file drop it.

const STREAM_TAIL_RE = /\/stream\/([^/?#]+)\/(master\.m3u8|file)$/;
const DIRECT_PARAM_RE = /^direct(=|$)/;
const RANGE_PARAM_RE = /^range(=|$)/;

/** The dynamic range a filtered master is asked for (`?range=pq|sdr`). */
export type StreamVideoRange = "pq" | "sdr";

interface SplitURL {
  path: string;
  query: string;
  fragment: string;
}

function splitURL(url: string): SplitURL {
  const hashIndex = url.indexOf("#");
  const fragment = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const withoutFragment = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = withoutFragment.indexOf("?");
  return {
    path:
      queryIndex >= 0 ? withoutFragment.slice(0, queryIndex) : withoutFragment,
    query: queryIndex >= 0 ? withoutFragment.slice(queryIndex + 1) : "",
    fragment,
  };
}

function joinURL({ path, query, fragment }: SplitURL): string {
  return path + (query ? `?${query}` : "") + fragment;
}

function queryParams(query: string): string[] {
  return query.split("&").filter((param) => param !== "");
}

function stripFromQuery(query: string, owned: RegExp): string {
  return queryParams(query)
    .filter((param) => !owned.test(param))
    .join("&");
}

function stripDirectFromQuery(query: string): string {
  return stripFromQuery(query, DIRECT_PARAM_RE);
}

function stripRangeFromQuery(query: string): string {
  return stripFromQuery(query, RANGE_PARAM_RE);
}

/**
 * The `<key>` segment of a stream URL (`…/stream/<key>/master.m3u8` or
 * `…/stream/<key>/file`), or null for anything else (banner clips, trailers).
 */
export function getStreamKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = splitURL(url).path.match(STREAM_TAIL_RE);
  return match ? match[1] : null;
}

/** True when the URL is the raw-file tier (`…/stream/<key>/file`). */
export function isFileTierURL(url: string | null | undefined): boolean {
  if (!url) return false;
  const match = splitURL(url).path.match(STREAM_TAIL_RE);
  return match?.[2] === "file";
}

/**
 * The `?direct=1` master for a stream master URL. Idempotent; returns
 * non-master URLs unchanged so callers can apply it unconditionally.
 */
export function withDirectParam(url: string): string {
  const parts = splitURL(url);
  const match = parts.path.match(STREAM_TAIL_RE);
  if (match?.[2] !== "master.m3u8") return url;
  const query = stripDirectFromQuery(parts.query);
  return joinURL({
    ...parts,
    query: query ? `${query}&direct=1` : "direct=1",
  });
}

/**
 * The `?direct=only` master: the Original copy rung and nothing transcoded,
 * one variant per audio group, so a player that cannot pin a variant plays
 * Original anyway. Source-preserving, so it never carries a `range`.
 * Idempotent; non-master URLs come back unchanged.
 */
export function withDirectOnlyParam(url: string): string {
  const parts = splitURL(url);
  const match = parts.path.match(STREAM_TAIL_RE);
  if (match?.[2] !== "master.m3u8") return url;
  const query = stripRangeFromQuery(stripDirectFromQuery(parts.query));
  return joinURL({
    ...parts,
    query: query ? `${query}&direct=only` : "direct=only",
  });
}

/** True when the URL is the pinned-Original master (`?direct=only`). */
export function isDirectOnlyURL(url: string | null | undefined): boolean {
  if (!url) return false;
  const parts = splitURL(url);
  if (parts.path.match(STREAM_TAIL_RE)?.[2] !== "master.m3u8") return false;
  return parts.query.split("&").includes("direct=only");
}

/** The same URL without any `direct` param. Idempotent. */
export function stripDirectParam(url: string): string {
  const parts = splitURL(url);
  return joinURL({ ...parts, query: stripDirectFromQuery(parts.query) });
}

/**
 * The range-filtered master (`?range=pq` or `?range=sdr`): only variants of
 * that dynamic range, so ABR never crosses between HDR and SDR. Replaces any
 * existing `range`. An older server ignores the param and serves its mixed
 * master, so callers must know the filter is supported before asking for it.
 *
 * `range` is written ahead of `direct`, which is where the direct helpers
 * leave it too, so one selection has one spelling whichever helper ran last —
 * the player hook compares sources as strings, and a second spelling would
 * read as a new source. Non-master URLs come back unchanged; the pinned
 * Original master only loses a stray `range`.
 */
export function withRangeParam(url: string, range: StreamVideoRange): string {
  const parts = splitURL(url);
  const match = parts.path.match(STREAM_TAIL_RE);
  if (match?.[2] !== "master.m3u8") return url;
  const params = queryParams(stripRangeFromQuery(parts.query));
  const direct = params.filter((param) => DIRECT_PARAM_RE.test(param));
  if (direct.includes("direct=only")) {
    return joinURL({ ...parts, query: params.join("&") });
  }
  const others = params.filter((param) => !DIRECT_PARAM_RE.test(param));
  return joinURL({
    ...parts,
    query: [...others, `range=${range}`, ...direct].join("&"),
  });
}

/**
 * The same master without any `range` param — the server's mixed ladder.
 * Idempotent; non-master URLs come back unchanged.
 */
export function stripRangeParam(url: string): string {
  const parts = splitURL(url);
  const match = parts.path.match(STREAM_TAIL_RE);
  if (match?.[2] !== "master.m3u8") return url;
  return joinURL({ ...parts, query: stripRangeFromQuery(parts.query) });
}

/**
 * The raw-file tier sibling (`…/stream/<key>/file`) of a stream URL, or null
 * when the URL is not a recognized stream URL. Server-issued query params are
 * preserved; `direct` and `range` are dropped (they are meaningless off the
 * master).
 */
export function fileURL(url: string): string | null {
  const parts = splitURL(url);
  const match = parts.path.match(STREAM_TAIL_RE);
  if (!match) return null;
  const path =
    match[2] === "file"
      ? parts.path
      : parts.path.slice(0, -"master.m3u8".length) + "file";
  return joinURL({
    ...parts,
    path,
    query: stripRangeFromQuery(stripDirectFromQuery(parts.query)),
  });
}

/**
 * The watch-history / presence identity for whatever is playing: the master
 * URL as the server delivered it, with all tier and range surgery reversed.
 * Heartbeats send this so the stored videoId strings stay stable across
 * tiers. The server hashes the pathname and folds every `/stream/<key>/…`
 * tail itself, so a tier-mutated id would NOT split history — for heartbeats
 * this is belt-and-braces, not load-bearing.
 *
 * It IS load-bearing for useQualityTier, which compares these ids to tell a
 * new item from the same item re-tiered: a `range` left in the id would make
 * a range change look like an episode switch. `range` is only ours on a
 * stream URL; on anything else it is someone else's param and stays.
 */
export function canonicalVideoId(url: string): string {
  const parts = splitURL(url);
  const match = parts.path.match(STREAM_TAIL_RE);
  const path =
    match?.[2] === "file"
      ? parts.path.slice(0, -"file".length) + "master.m3u8"
      : parts.path;
  const query = stripDirectFromQuery(parts.query);
  return joinURL({
    ...parts,
    path,
    query: match ? stripRangeFromQuery(query) : query,
  });
}

/**
 * A URL-free description of which delivery tier a source URL points at, and
 * which range it asks for, for diagnostics. Stream URLs carry the private
 * transcoder host and per-title key, so log lines must never print them. The
 * range here is the one REQUESTED; what the decoder actually outputs is a
 * separate fact the URL cannot know.
 */
export function describeStreamTier(url: string | null | undefined): string {
  if (!url) return "none";
  const parts = splitURL(url);
  const tail = parts.path.match(STREAM_TAIL_RE)?.[2];
  if (tail === "file") return "file";
  if (tail !== "master.m3u8") return "other";
  const params = parts.query.split("&");
  const controls: string[] = [];
  if (params.includes("direct=only")) controls.push("direct=only");
  else if (params.includes("direct=1")) controls.push("direct=1");
  const ranges = params.filter((param) => RANGE_PARAM_RE.test(param));
  if (
    ranges.length === 1 &&
    (ranges[0] === "range=pq" || ranges[0] === "range=sdr")
  ) {
    controls.push(ranges[0]);
  } else if (ranges.length > 0) {
    // Repeated or unrecognized: say so without echoing the value, so this
    // string stays safe to log.
    controls.push("range=invalid");
  }
  return controls.length > 0 ? `hls:${controls.join(",")}` : "hls";
}
