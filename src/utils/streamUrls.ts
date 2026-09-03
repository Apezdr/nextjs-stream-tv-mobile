// Tier-URL derivation for the delivery-tiers server contract
// (FRONTEND_PLAYBACK_REQUIREMENTS.md). The server hands the app one opaque
// `videoURL` shaped `…/stream/<key>/master.m3u8[?query]` and can rotate it at
// any time, so tier siblings (`?direct=1`, `/file`) are derived from the
// current URL by string surgery and never stored. Query params other than
// `direct` may be server-issued (tokens) and must round-trip byte-for-byte,
// which is why this avoids URLSearchParams re-encoding.

const STREAM_TAIL_RE = /\/stream\/([^/?#]+)\/(master\.m3u8|file)$/;

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

function stripDirectFromQuery(query: string): string {
  return query
    .split("&")
    .filter((param) => param !== "" && !/^direct(=|$)/.test(param))
    .join("&");
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
 * Original anyway. Idempotent; non-master URLs come back unchanged.
 */
export function withDirectOnlyParam(url: string): string {
  const parts = splitURL(url);
  const match = parts.path.match(STREAM_TAIL_RE);
  if (match?.[2] !== "master.m3u8") return url;
  const query = stripDirectFromQuery(parts.query);
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
 * The raw-file tier sibling (`…/stream/<key>/file`) of a stream URL, or null
 * when the URL is not a recognized stream URL. Server-issued query params are
 * preserved; `direct` is dropped (it is meaningless off the master).
 */
export function fileURL(url: string): string | null {
  const parts = splitURL(url);
  const match = parts.path.match(STREAM_TAIL_RE);
  if (!match) return null;
  const path =
    match[2] === "file"
      ? parts.path
      : parts.path.slice(0, -"master.m3u8".length) + "file";
  return joinURL({ ...parts, path, query: stripDirectFromQuery(parts.query) });
}

/**
 * The watch-history / presence identity for whatever is playing: the master
 * URL as the server delivered it, with all tier surgery reversed. Heartbeats
 * must always send this — a `?direct=1` or `/file` videoId would split resume
 * history across tiers and restart presence sessions mid-viewing.
 */
export function canonicalVideoId(url: string): string {
  const parts = splitURL(url);
  const match = parts.path.match(STREAM_TAIL_RE);
  const path =
    match?.[2] === "file"
      ? parts.path.slice(0, -"file".length) + "master.m3u8"
      : parts.path;
  return joinURL({ ...parts, path, query: stripDirectFromQuery(parts.query) });
}

/**
 * A URL-free description of which delivery tier a source URL points at, for
 * diagnostics. Stream URLs carry the private transcoder host and per-title
 * key, so log lines must never print them.
 */
export function describeStreamTier(url: string | null | undefined): string {
  if (!url) return "none";
  const parts = splitURL(url);
  const tail = parts.path.match(STREAM_TAIL_RE)?.[2];
  if (tail === "file") return "file";
  if (tail !== "master.m3u8") return "other";
  const params = parts.query.split("&");
  if (params.includes("direct=only")) return "hls:direct=only";
  if (params.includes("direct=1")) return "hls:direct=1";
  return "hls";
}
