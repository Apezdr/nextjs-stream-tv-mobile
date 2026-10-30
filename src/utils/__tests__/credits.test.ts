import type { CreditsEntry } from "@/src/data/types/content.types";
import {
  displayUrl,
  entryAppliesTo,
  entryHeading,
  entryNotices,
  entryRows,
  groupCreditsEntries,
  hasCredits,
  isHttpUrl,
  titleCreditsKey,
} from "@/src/utils/credits";

const poster: CreditsEntry = {
  id: "poster-credit",
  scope: "title",
  kind: "poster",
  assets: [{ id: "poster", kind: "poster", path: "poster.jpg" }],
  work: "Example poster",
  author: "Creator / designated attribution parties",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  exclusions: ["The logos on the poster"],
};

describe("hasCredits", () => {
  it("accepts schema 1 with at least one entry", () => {
    expect(hasCredits({ schemaVersion: 1, entries: [poster] })).toBe(true);
  });

  it("rejects an absent key, an empty list and an unknown schema", () => {
    expect(hasCredits(undefined)).toBe(false);
    expect(hasCredits(null)).toBe(false);
    expect(hasCredits({ schemaVersion: 1, entries: [] })).toBe(false);
    expect(hasCredits({ schemaVersion: 2, entries: [poster] })).toBe(false);
    expect(hasCredits({ entries: [poster] })).toBe(false);
  });
});

describe("isHttpUrl / displayUrl", () => {
  it("links only http(s) URLs that parse", () => {
    expect(isHttpUrl("https://example.com/a")).toBe(true);
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("example.com")).toBe(false);
    expect(isHttpUrl("https://user:pw@example.com")).toBe(false);
    expect(isHttpUrl(42)).toBe(false);
  });

  it("shows the URL without its scheme", () => {
    expect(displayUrl("https://creativecommons.org/licenses/by/4.0/")).toBe(
      "creativecommons.org/licenses/by/4.0/",
    );
    expect(displayUrl("HTTP://Example.com")).toBe("Example.com");
  });
});

describe("groupCreditsEntries", () => {
  it("groups by kind in the fixed order and drops empty groups", () => {
    const film: CreditsEntry = {
      id: "film",
      scope: "title",
      assets: [{ id: "film", kind: "film" }],
    };
    const music: CreditsEntry = {
      id: "score",
      scope: "title",
      kind: "music",
      assets: [{ id: "score", kind: "music" }],
    };
    const groups = groupCreditsEntries([music, poster, film]);
    expect(groups.map((g) => g.heading)).toEqual([
      "Video",
      "Artwork",
      "Music & audio",
    ]);
    expect(groups[0].entries).toEqual([film]);
  });

  it("keeps the server's order inside a group", () => {
    const a: CreditsEntry = {
      id: "a",
      scope: "show",
      assets: [{ id: "a", kind: "backdrop" }],
    };
    const b: CreditsEntry = {
      id: "b",
      scope: "episode",
      assets: [{ id: "b", kind: "thumbnail" }],
    };
    expect(groupCreditsEntries([a, b])[0].entries).toEqual([a, b]);
  });

  it("puts an unknown kind under Other instead of hiding it", () => {
    const odd = {
      id: "odd",
      scope: "title",
      assets: [{ id: "odd", kind: "hologram" }],
    } as unknown as CreditsEntry;
    expect(groupCreditsEntries([odd])).toEqual([
      { heading: "Other", entries: [odd] },
    ]);
  });
});

describe("entry heading and applies-to", () => {
  it("uses work, else the asset labels, else the kind name", () => {
    expect(entryHeading(poster)).toBe("Example poster");
    expect(
      entryHeading({
        id: "x",
        scope: "title",
        assets: [
          { id: "a", kind: "poster", label: "Season 1 poster" },
          { id: "b", kind: "backdrop" },
        ],
      }),
    ).toBe("Season 1 poster, Backdrop");
  });

  it("marks a show's inherited entry as a series credit", () => {
    expect(entryAppliesTo(poster)).toBe("Applies to: Poster");
    expect(entryAppliesTo({ ...poster, scope: "show" })).toBe(
      "Series credit · Applies to: Poster",
    );
  });
});

describe("entryRows", () => {
  it("emits only the rows that have something, in the shared order", () => {
    const rows = entryRows(poster);
    expect(rows.map((r) => r.label)).toEqual(["By", "License", "Not covered"]);
    expect(rows[1].lines).toEqual([
      { text: "CC BY 4.0" },
      {
        text: "creativecommons.org/licenses/by/4.0/",
        url: "https://creativecommons.org/licenses/by/4.0/",
      },
    ]);
    expect(rows[2].lines).toEqual([{ text: "The logos on the poster" }]);
  });

  it("keeps a non-http URL as plain text and reads derivedFrom notes", () => {
    const rows = entryRows({
      id: "art",
      scope: "show",
      assets: [
        {
          id: "art",
          kind: "artwork",
          derivedFrom: [
            { libraryPath: "shows/x/s01e01.mkv", note: "Frame at 12:04" },
            { libraryPath: "shows/x/poster.jpg" },
          ],
        },
      ],
      sourceUrl: "ftp://files.example.com/art",
      attributionText: "Line one\nLine two",
    });
    expect(rows).toEqual([
      { label: "Attribution", lines: [{ text: "Line one\nLine two" }] },
      { label: "Source", lines: [{ text: "ftp://files.example.com/art" }] },
      {
        label: "Derived from",
        lines: [{ text: "Frame at 12:04" }, { text: "shows/x/poster.jpg" }],
      },
    ]);
  });

  it("ignores blank strings and empty arrays", () => {
    expect(
      entryRows({
        id: "blank",
        scope: "title",
        assets: [{ id: "a", kind: "other" }],
        author: "  ",
        exclusions: ["", "   "],
        previousModifications: [],
      }),
    ).toEqual([]);
  });
});

describe("entryNotices", () => {
  it("orders notices, then labelled historical notices, then the note", () => {
    expect(
      entryNotices({
        id: "n",
        scope: "title",
        assets: [{ id: "a", kind: "film" }],
        note: "A note",
        historicalNotices: ["Old notice"],
        notices: ["Notice 1", "Notice 2"],
      }),
    ).toEqual([
      { text: "Notice 1" },
      { text: "Notice 2" },
      { label: "Notice on the original work", text: "Old notice" },
      { text: "A note" },
    ]);
  });
});

describe("titleCreditsKey", () => {
  it("ignores the season for a show, keeps it for an episode", () => {
    expect(titleCreditsKey({ type: "tv", id: "abc", season: 2 })).toBe(
      "tv:abc",
    );
    expect(
      titleCreditsKey({ type: "tv", id: "abc", season: 2, episode: 3 }),
    ).toBe("tv:abc:s2e3");
    expect(titleCreditsKey({ type: "movie", id: "m1" })).toBe("movie:m1");
  });
});
