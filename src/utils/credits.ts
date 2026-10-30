import type {
  Credits,
  CreditsEntry,
  CreditsKind,
} from "@/src/data/types/content.types";

/**
 * Credits & licenses: the display rules every client shares (CREDITS_SIDECAR.md
 * §6, mirrored by the web's CreditsPanel). Pure functions over the server's
 * already-resolved `credits` object; the screens only lay the results out.
 *
 * Everything here shows what the server sent, verbatim and in its order. An
 * absent field is left out, never filled in.
 */

export const CREDITS_SCHEMA_VERSION = 1;

/** The only credits the app renders: schema 1 with at least one entry. */
export function hasCredits(credits: unknown): credits is Credits {
  if (!credits || typeof credits !== "object") return false;
  const c = credits as Partial<Credits>;
  return (
    c.schemaVersion === CREDITS_SCHEMA_VERSION &&
    Array.isArray(c.entries) &&
    c.entries.length > 0
  );
}

/**
 * A URL is a link only when it parses and its scheme is http(s); anything
 * else is plain text. Credentials in the URL would let a link hide where it
 * goes, so those are plain text too.
 */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/** The link text: the URL itself without its scheme, so nothing is hidden. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "");
}

const KIND_NAMES: Record<CreditsKind, string> = {
  film: "Film",
  episode: "Episode",
  trailer: "Trailer",
  poster: "Poster",
  backdrop: "Backdrop",
  logo: "Logo",
  thumbnail: "Thumbnail",
  artwork: "Artwork",
  music: "Music",
  audio: "Audio",
  subtitles: "Subtitles",
  other: "Other",
};

/** Group headings in display order, and the asset kinds each one holds. */
export const CREDITS_GROUPS: { heading: string; kinds: CreditsKind[] }[] = [
  { heading: "Video", kinds: ["film", "episode", "trailer"] },
  {
    heading: "Artwork",
    kinds: ["poster", "backdrop", "logo", "thumbnail", "artwork"],
  },
  { heading: "Music & audio", kinds: ["music", "audio"] },
  { heading: "Subtitles", kinds: ["subtitles"] },
  { heading: "Other", kinds: ["other"] },
];

export interface CreditsGroup {
  heading: string;
  entries: CreditsEntry[];
}

/** The kind an entry is grouped by: its own, else its first asset's. */
export function entryKind(entry: CreditsEntry): CreditsKind | undefined {
  return entry.kind ?? entry.assets?.[0]?.kind;
}

/**
 * Entries by group heading, in the fixed order, empty groups left out. Inside
 * a group the server's order is kept. A kind this build does not know lands
 * in "Other" rather than vanishing.
 */
export function groupCreditsEntries(entries: CreditsEntry[]): CreditsGroup[] {
  const groups: CreditsGroup[] = CREDITS_GROUPS.map((group) => ({
    heading: group.heading,
    entries: [],
  }));
  const other = groups[groups.length - 1];

  for (const entry of entries) {
    const kind = entryKind(entry);
    const index = CREDITS_GROUPS.findIndex(
      (g) => kind !== undefined && g.kinds.includes(kind),
    );
    (index >= 0 ? groups[index] : other).entries.push(entry);
  }

  return groups.filter((group) => group.entries.length > 0);
}

export function kindName(kind: string | undefined): string {
  if (!kind) return KIND_NAMES.other;
  return KIND_NAMES[kind as CreditsKind] ?? kind;
}

function present(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function presentList(values: unknown): string[] {
  return Array.isArray(values) ? values.filter(present) : [];
}

/** What the entry covers, one label per asset: its label, else its kind. */
export function assetLabels(entry: CreditsEntry): string[] {
  const assets = Array.isArray(entry.assets) ? entry.assets : [];
  return assets.map((asset) =>
    present(asset.label) ? asset.label : kindName(asset.kind),
  );
}

/** The entry's heading: `work`, else its asset labels joined with commas. */
export function entryHeading(entry: CreditsEntry): string {
  if (present(entry.work)) return entry.work;
  const labels = assetLabels(entry);
  return labels.length > 0 ? labels.join(", ") : kindName(entryKind(entry));
}

/** "Applies to: …", prefixed "Series credit · " for a show's inherited entry. */
export function entryAppliesTo(entry: CreditsEntry): string {
  const prefix = entry.scope === "show" ? "Series credit · " : "";
  return `${prefix}Applies to: ${assetLabels(entry).join(", ")}`;
}

export interface CreditsLine {
  text: string;
  /** Set only for an http(s) URL; the line is then a link to it. */
  url?: string;
}

export interface CreditsRow {
  label: string;
  lines: CreditsLine[];
}

function urlLine(value: string): CreditsLine {
  return isHttpUrl(value)
    ? { text: displayUrl(value), url: value }
    : { text: value };
}

/**
 * The label-and-value rows under an entry, in the shared order, each only
 * when it has something to show.
 */
export function entryRows(entry: CreditsEntry): CreditsRow[] {
  const rows: CreditsRow[] = [];
  const push = (label: string, lines: CreditsLine[]) => {
    if (lines.length > 0) rows.push({ label, lines });
  };

  push("By", [
    ...(present(entry.author) ? [{ text: entry.author }] : []),
    ...(present(entry.authorUrl) ? [urlLine(entry.authorUrl)] : []),
  ]);
  push(
    "Attribution",
    present(entry.attributionText) ? [{ text: entry.attributionText }] : [],
  );
  push(
    "Copyright",
    present(entry.copyrightNotice) ? [{ text: entry.copyrightNotice }] : [],
  );
  push("License", [
    ...(present(entry.license) ? [{ text: entry.license }] : []),
    ...(present(entry.licenseUrl) ? [urlLine(entry.licenseUrl)] : []),
  ]);
  push("Source", present(entry.sourceUrl) ? [urlLine(entry.sourceUrl)] : []);

  const derived: CreditsLine[] = [];
  for (const asset of Array.isArray(entry.assets) ? entry.assets : []) {
    for (const item of asset.derivedFrom ?? []) {
      if (present(item.note)) derived.push({ text: item.note });
      else if (present(item.libraryPath))
        derived.push({ text: item.libraryPath });
    }
  }
  push("Derived from", derived);

  push(
    "Changes",
    present(entry.modification) ? [{ text: entry.modification }] : [],
  );
  push(
    "Earlier changes",
    presentList(entry.previousModifications).map((text) => ({ text })),
  );
  push(
    "Not covered",
    presentList(entry.exclusions).map((text) => ({ text })),
  );

  return rows;
}

export interface CreditsNotice {
  /** Shown above the text when set ("Notice on the original work"). */
  label?: string;
  text: string;
}

/**
 * The collapsed "Notices and conditions" section: notices, then historical
 * notices (labelled), then the note. Verbatim, in order.
 */
export function entryNotices(entry: CreditsEntry): CreditsNotice[] {
  return [
    ...presentList(entry.notices).map((text) => ({ text })),
    ...presentList(entry.historicalNotices).map((text) => ({
      label: "Notice on the original work",
      text,
    })),
    ...(present(entry.note) ? [{ text: entry.note }] : []),
  ];
}

/** A stable React key: ids repeat across scopes, so the scope is part of it. */
export function entryKey(entry: CreditsEntry, index: number): string {
  return `${entry.scope}-${entry.id}-${index}`;
}

/**
 * The key a title's credits travel under between the TV media-info screen
 * and the credits view. A season has no credits of its own, so a show's key
 * ignores the season unless an episode is named.
 */
export function titleCreditsKey(params: {
  type: string;
  id: string;
  season?: number | string;
  episode?: number | string;
}): string {
  const { type, id, season, episode } = params;
  if (episode !== undefined && episode !== null && episode !== "") {
    return `${type}:${id}:s${season}e${episode}`;
  }
  return `${type}:${id}`;
}
