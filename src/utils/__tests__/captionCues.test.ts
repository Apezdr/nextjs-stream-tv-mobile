import {
  captionMarkupCensus,
  cueAt,
  cueTextAt,
  parseCaptionCues,
  parseCaptionTimestamp,
  parseCueLineRuns,
  stripCueMarkup,
} from "../captionCues";

const VTT = `WEBVTT

NOTE a comment block
that spans lines

1
00:00:01.000 --> 00:00:04.000 align:start position:10%
<i>Hello</i> there

00:01:05.500 --> 00:01:07.250
Second line one
Second line two

STYLE
::cue { color: red }
`;

const SRT = `1
00:00:01,000 --> 00:00:04,000
Hello there

2
00:00:05,000 --> 00:00:06,000
{\\an8}Top <b>bold</b>
`;

describe("parseCaptionTimestamp", () => {
  it("reads hours, minutes, seconds and millis in both dialects", () => {
    expect(parseCaptionTimestamp("00:01:05.500")).toBe(65.5);
    expect(parseCaptionTimestamp("01:05.5")).toBe(65.5);
    expect(parseCaptionTimestamp("00:00:01,250")).toBe(1.25);
    expect(parseCaptionTimestamp("garbage")).toBeNull();
  });
});

describe("parseCaptionCues", () => {
  it("parses WebVTT, skipping the header, notes, styles and cue settings", () => {
    const cues = parseCaptionCues(VTT);
    expect(cues.map(({ start, end, text }) => ({ start, end, text }))).toEqual([
      { start: 1, end: 4, text: "Hello there" },
      { start: 65.5, end: 67.25, text: "Second line one\nSecond line two" },
    ]);
    expect(cues[0].runs).toEqual([
      { text: "Hello", italic: true },
      { text: " there" },
    ]);
    expect(cues[1].runs).toEqual([
      { text: "Second line one" },
      { text: "\n" },
      { text: "Second line two" },
    ]);
  });

  it("parses SRT with comma millis and keeps bold while dropping positions", () => {
    const cues = parseCaptionCues(SRT);
    expect(cues.map((c) => c.text)).toEqual(["Hello there", "Top bold"]);
    expect(cues[1].runs).toEqual([
      { text: "Top " },
      { text: "bold", bold: true },
    ]);
  });

  it("carries an ASS alignment or a VTT line setting as the cue's position", () => {
    const cues = parseCaptionCues(SRT);
    expect(cues[0].position).toBeUndefined();
    expect(cues[1].position).toBe("top");
    const middle = parseCaptionCues(
      "1\n00:00:01,000 --> 00:00:02,000\n{\\an5}Centre\n",
    );
    expect(middle[0].position).toBe("middle");
    const bottom = parseCaptionCues(
      "1\n00:00:01,000 --> 00:00:02,000\n{\\an2}Low\n",
    );
    expect(bottom[0].position).toBeUndefined();
    const vtt = parseCaptionCues(
      "WEBVTT\n\n00:00:01.000 --> 00:00:02.000 line:10% align:center\nUp\n\n00:00:03.000 --> 00:00:04.000 line:90%\nDown\n\n00:00:05.000 --> 00:00:06.000 line:1\nLine one\n",
    );
    expect(vtt.map((c) => c.position)).toEqual(["top", undefined, "top"]);
  });

  it("handles CRLF line endings and a BOM", () => {
    const crlf = "\uFEFFWEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nHi\r\n";
    expect(parseCaptionCues(crlf).map((c) => c.text)).toEqual(["Hi"]);
  });

  it("returns nothing for text without cues instead of throwing", () => {
    expect(parseCaptionCues("")).toEqual([]);
    expect(parseCaptionCues('{"error":"nope"}')).toEqual([]);
  });
});

describe("parseCueLineRuns", () => {
  it("nests italic inside bold and closes in order", () => {
    expect(parseCueLineRuns("<b>Bold <i>both</i> bold</b> plain")).toEqual([
      { text: "Bold ", bold: true },
      { text: "both", bold: true, italic: true },
      { text: " bold", bold: true },
      { text: " plain" },
    ]);
  });

  it("reads SRT font colours and WebVTT colour classes", () => {
    expect(parseCueLineRuns('<font color="#ffff00">Yellow</font> no')).toEqual([
      { text: "Yellow", color: "#ffff00" },
      { text: " no" },
    ]);
    expect(parseCueLineRuns("<c.yellow.bg_black>Hi</c>")).toEqual([
      { text: "Hi", color: "yellow" },
    ]);
    expect(parseCueLineRuns("<c.unknown>Hi</c>")).toEqual([{ text: "Hi" }]);
  });

  it("applies ASS overrides and drops the positioning ones", () => {
    expect(parseCueLineRuns("{\\an8}{\\i1}Whisper{\\i0} loud")).toEqual([
      { text: "Whisper", italic: true },
      { text: " loud" },
    ]);
  });

  it("keeps the text of voices, rubies and unknown tags", () => {
    expect(
      parseCueLineRuns(
        "<v Narrator>Once upon</v> a <ruby>time<rt>t</rt></ruby>",
      ),
    ).toEqual([{ text: "Once upon a timet" }]);
    expect(parseCueLineRuns("<u>under</u> <00:01.000>karaoke")).toEqual([
      { text: "under", underline: true },
      { text: " karaoke" },
    ]);
  });

  it("decodes entities and survives stray brackets", () => {
    expect(parseCueLineRuns("Tom &amp; Jerry &lt;3 a < b")).toEqual([
      { text: "Tom & Jerry <3 a < b" },
    ]);
    expect(parseCueLineRuns("</i>unmatched")).toEqual([{ text: "unmatched" }]);
  });
});

describe("cueAt / cueTextAt", () => {
  const cues = parseCaptionCues(VTT);
  it("finds the cue covering a time and nothing between cues", () => {
    expect(cueTextAt(cues, 2)).toBe("Hello there");
    expect(cueTextAt(cues, 4)).toBe("Hello there");
    expect(cueTextAt(cues, 30)).toBe("");
    expect(cueAt(cues, 66)?.text).toBe("Second line one\nSecond line two");
    expect(cueAt([], 1)).toBeNull();
  });
});

describe("stripCueMarkup", () => {
  it("removes tags and decodes entities", () => {
    expect(stripCueMarkup("<c.yellow>Tom &amp; Jerry</c>")).toBe("Tom & Jerry");
  });
});

describe("captionMarkupCensus", () => {
  it("lists each kind of tag once, numbers collapsed", () => {
    expect(
      captionMarkupCensus(`${VTT}\n<00:01.000>k <c.red>r</c> {\\an8}{\\an8}`),
    ).toEqual(["</c>", "</i>", "<c.red>", "<i>", "{\\an#}"]);
  });
});
