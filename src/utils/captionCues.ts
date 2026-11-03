/**
 * Caption cues from a WebVTT or SubRip (SRT) file, and the cue showing at a
 * given time. Format is detected from the content, never from the URL: the
 * server's subtitle route has no file extension.
 *
 * Inline markup is kept as styled runs rather than stripped: `<i>`, `<b>`,
 * `<u>`, SRT `<font color>`, WebVTT colour classes (`<c.yellow>`), and the
 * ASS-style `{\i1}` … `{\i0}` overrides some tools leave in SRT files.
 * Positioning (`{\an8}`, cue settings), voices (`<v Name>`) and anything
 * unknown are dropped; their text stays.
 */
export interface CaptionRun {
  text: string;
  italic?: boolean;
  bold?: boolean;
  underline?: boolean;
  /** CSS colour name or hex, from `<font color>` or a WebVTT colour class. */
  color?: string;
}

/** Where a cue sits in the picture; absent means the usual bottom. */
export type CaptionPosition = "top" | "middle";

export interface CaptionCue {
  /** Seconds. */
  start: number;
  /** Seconds. */
  end: number;
  /** Plain text, lines joined with "\n". */
  text: string;
  /** The same text as styled runs, in order; line breaks are "\n" runs. */
  runs: CaptionRun[];
  /**
   * From an ASS `{\anN}` override (7–9 top, 4–6 middle) or a WebVTT
   * `line:` setting: authors move a cue up when the bottom of the frame has
   * burnt-in text or a second speaker.
   */
  position?: CaptionPosition;
}

// "HH:MM:SS.mmm", "MM:SS.mmm", and the SRT comma variant.
const TIMESTAMP = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const CUE_TIMING = new RegExp(
  `^\\s*${TIMESTAMP.source}\\s*-->\\s*${TIMESTAMP.source}`,
);
// ASS alignment override: numpad layout, 7 8 9 across the top, 4 5 6 the
// middle, 1 2 3 the bottom.
const ASS_ALIGNMENT = /\{\\an([1-9])\}/;
// WebVTT `line:` cue setting, as a percentage of the frame or a line number
// (non-negative from the top, negative from the bottom).
const VTT_LINE_SETTING = /\bline:(-?\d+)(%?)/;

/** The position an ASS alignment digit asks for. */
export function positionForAlignment(
  digit: number,
): CaptionPosition | undefined {
  if (digit >= 7) return "top";
  if (digit >= 4) return "middle";
  return undefined;
}

/** The position a WebVTT `line:` setting asks for. */
export function positionForVttLine(
  value: number,
  isPercent: boolean,
): CaptionPosition | undefined {
  if (isPercent) {
    if (value < 35) return "top";
    if (value < 65) return "middle";
    return undefined;
  }
  // Line numbers count from the top when non-negative; a handful of lines
  // down is the top of the frame.
  if (value >= 0 && value <= 4) return "top";
  return undefined;
}

// The WebVTT default colour classes (<c.red>, <c.bg_black> is background
// and ignored). Any other class name is ignored.
const VTT_COLOR_CLASSES = new Set([
  "white",
  "lime",
  "cyan",
  "red",
  "yellow",
  "magenta",
  "blue",
  "black",
]);

export function parseCaptionTimestamp(value: string): number | null {
  const match = TIMESTAMP.exec(value);
  if (!match) return null;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const millis = parseInt(match[4].padEnd(3, "0"), 10);
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&lrm;|&rlm;/g, "");
}

interface RunStyle {
  italic: boolean;
  bold: boolean;
  underline: boolean;
  color: string | null;
}

function styledRun(text: string, style: RunStyle): CaptionRun {
  const run: CaptionRun = { text };
  if (style.italic) run.italic = true;
  if (style.bold) run.bold = true;
  if (style.underline) run.underline = true;
  if (style.color) run.color = style.color;
  return run;
}

// One token: an HTML-style tag, an ASS override block, or a stretch of text.
const TOKEN = /(<[^>]*>|\{\\[^}]*\}|[^<{]+|[<{])/g;

/**
 * Split one cue line into styled runs. Tags open and close a style stack;
 * an unmatched close is ignored, unclosed styles run to the end of the line
 * (every line starts clean, as players do).
 */
export function parseCueLineRuns(line: string): CaptionRun[] {
  const runs: CaptionRun[] = [];
  const stack: RunStyle[] = [];
  const style: RunStyle = {
    italic: false,
    bold: false,
    underline: false,
    color: null,
  };
  const push = (text: string) => {
    if (!text) return;
    const last = runs[runs.length - 1];
    const next = styledRun(decodeEntities(text), style);
    if (
      last &&
      last.italic === next.italic &&
      last.bold === next.bold &&
      last.underline === next.underline &&
      last.color === next.color
    ) {
      last.text += next.text;
    } else {
      runs.push(next);
    }
  };
  const open = (change: Partial<RunStyle>) => {
    stack.push({ ...style });
    Object.assign(style, change);
  };
  const close = () => {
    const previous = stack.pop();
    if (previous) Object.assign(style, previous);
  };

  for (const match of line.matchAll(TOKEN)) {
    const token = match[0];
    if (token.startsWith("<") && token.endsWith(">") && token.length > 2) {
      const inner = token.slice(1, -1).trim();
      const closing = inner.startsWith("/");
      const name = (closing ? inner.slice(1) : inner)
        .split(/[\s.]/)[0]
        .toLowerCase();
      if (closing) {
        if (["i", "b", "u", "font", "c", "em", "strong"].includes(name)) {
          close();
        }
        continue;
      }
      if (name === "i" || name === "em") open({ italic: true });
      else if (name === "b" || name === "strong") open({ bold: true });
      else if (name === "u") open({ underline: true });
      else if (name === "font") {
        const color = /color\s*=\s*["']?([#\w]+)/i.exec(inner)?.[1];
        open({ color: color ?? style.color });
      } else if (name === "c") {
        const classes = inner.slice(1).split(".").slice(1);
        const color = classes.find((c) => VTT_COLOR_CLASSES.has(c));
        open({ color: color ?? style.color });
      }
      // Voices, rubies, timestamps and unknown tags: text only.
      continue;
    }
    if (token.startsWith("{\\")) {
      // ASS overrides: \i1 \i0 \b1 \b0 \u1 \u0; positions (\an8) and the
      // rest are dropped.
      const body = token.slice(1, -1);
      for (const override of body.split("\\").filter(Boolean)) {
        const flag = /^([ibu])([01])/.exec(override);
        if (!flag) continue;
        const on = flag[2] === "1";
        if (flag[1] === "i") style.italic = on;
        if (flag[1] === "b") style.bold = on;
        if (flag[1] === "u") style.underline = on;
      }
      continue;
    }
    push(token);
  }
  return runs;
}

/** Drop inline markup and decode entities; the plain text of a line. */
export function stripCueMarkup(text: string): string {
  return parseCueLineRuns(text)
    .map((run) => run.text)
    .join("")
    .trim();
}

/**
 * Parse VTT or SRT text into sorted cues. Lines before the first timing
 * line (the WEBVTT header, NOTE/STYLE blocks, SRT indexes) are skipped;
 * a blank line ends a cue. Returns an empty list for text that holds no
 * cues, never throws.
 */
export function parseCaptionCues(text: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let current: CaptionCue | null = null;

  const commit = () => {
    if (current && current.text.length > 0 && current.end >= current.start) {
      cues.push(current);
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\uFEFF/g, "");
    const timing = CUE_TIMING.exec(line);
    if (timing) {
      commit();
      const arrow = line.indexOf("-->");
      const start = parseCaptionTimestamp(line.slice(0, arrow));
      const end = parseCaptionTimestamp(line.slice(arrow + 3));
      if (start === null || end === null) continue;
      current = { start, end, text: "", runs: [] };
      const vttLine = VTT_LINE_SETTING.exec(line.slice(arrow + 3));
      if (vttLine) {
        const position = positionForVttLine(
          parseInt(vttLine[1], 10),
          vttLine[2] === "%",
        );
        if (position) current.position = position;
      }
      continue;
    }
    if (line.trim() === "") {
      commit();
      continue;
    }
    if (!current) continue;
    const alignment = ASS_ALIGNMENT.exec(line);
    if (alignment) {
      const position = positionForAlignment(parseInt(alignment[1], 10));
      if (position) current.position = position;
    }
    const runs = parseCueLineRuns(line.trim());
    const plain = runs.map((run) => run.text).join("");
    if (!plain.trim()) continue;
    if (current.text) {
      current.text += "\n";
      current.runs.push({ text: "\n" });
    }
    current.text += plain;
    current.runs.push(...runs);
  }
  commit();

  cues.sort((a, b) => a.start - b.start);
  return cues;
}

/** The cue covering `time`, or null. */
export function cueAt(
  cues: readonly CaptionCue[],
  time: number,
): CaptionCue | null {
  let low = 0;
  let high = cues.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const cue = cues[mid];
    if (time < cue.start) {
      high = mid - 1;
    } else if (time > cue.end) {
      low = mid + 1;
    } else {
      return cue;
    }
  }
  return null;
}

/** The text showing at `time`, or "" when no cue covers it. */
export function cueTextAt(cues: readonly CaptionCue[], time: number): string {
  return cueAt(cues, time)?.text ?? "";
}

/**
 * Every distinct markup token in a caption file (`<i>`, `<c.yellow>`,
 * `{\an8}`, …), tag attributes included, for finding out what real files
 * use. Diagnostics only.
 */
export function captionMarkupCensus(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(/<\/?[a-zA-Z][^>]*>|\{\\[^}]*\}/g)) {
    // Collapse timestamps and numbers so each kind of tag counts once.
    seen.add(match[0].replace(/\d[\d:.,]*/g, "#"));
  }
  return [...seen].sort();
}
