import {
  isDirectOnlyURL,
  withDirectOnlyParam,
  canonicalVideoId,
  fileURL,
  getStreamKey,
  isFileTierURL,
  stripDirectParam,
  withDirectParam,
} from "../streamUrls";

const MASTER = "https://transcoder.example.com/stream/abc123/master.m3u8";
const MASTER_WITH_TOKEN = `${MASTER}?token=a%2Bb&x=1`;
const FILE = "https://transcoder.example.com/stream/abc123/file";

describe("getStreamKey", () => {
  it("extracts the key from master and file URLs", () => {
    expect(getStreamKey(MASTER)).toBe("abc123");
    expect(getStreamKey(FILE)).toBe("abc123");
    expect(getStreamKey(`${MASTER}?direct=1`)).toBe("abc123");
  });

  it("returns null for non-stream URLs and nullish input", () => {
    expect(getStreamKey("https://cdn.example.com/clips/intro.mp4")).toBeNull();
    expect(getStreamKey("https://x.com/stream/abc123/other.m3u8")).toBeNull();
    expect(getStreamKey(null)).toBeNull();
    expect(getStreamKey(undefined)).toBeNull();
    expect(getStreamKey("")).toBeNull();
  });
});

describe("withDirectParam", () => {
  it("appends direct=1 to a bare master URL", () => {
    expect(withDirectParam(MASTER)).toBe(`${MASTER}?direct=1`);
  });

  it("preserves existing query params byte-for-byte", () => {
    expect(withDirectParam(MASTER_WITH_TOKEN)).toBe(
      `${MASTER}?token=a%2Bb&x=1&direct=1`,
    );
  });

  it("is idempotent and replaces stray direct values", () => {
    expect(withDirectParam(withDirectParam(MASTER))).toBe(`${MASTER}?direct=1`);
    expect(withDirectParam(`${MASTER}?direct=0`)).toBe(`${MASTER}?direct=1`);
  });

  it("does not touch a direct-like param on another key", () => {
    expect(withDirectParam(`${MASTER}?redirect=1`)).toBe(
      `${MASTER}?redirect=1&direct=1`,
    );
    expect(withDirectParam(`${MASTER}?directors=2`)).toBe(
      `${MASTER}?directors=2&direct=1`,
    );
  });

  it("leaves non-master URLs unchanged", () => {
    expect(withDirectParam(FILE)).toBe(FILE);
    expect(withDirectParam("https://cdn.example.com/clip.mp4")).toBe(
      "https://cdn.example.com/clip.mp4",
    );
  });
});

describe("stripDirectParam", () => {
  it("removes the direct param and drops an empty query", () => {
    expect(stripDirectParam(`${MASTER}?direct=1`)).toBe(MASTER);
  });

  it("keeps other params intact", () => {
    expect(stripDirectParam(`${MASTER}?token=a%2Bb&direct=1&x=1`)).toBe(
      MASTER_WITH_TOKEN,
    );
  });

  it("is a no-op without a direct param", () => {
    expect(stripDirectParam(MASTER_WITH_TOKEN)).toBe(MASTER_WITH_TOKEN);
    expect(stripDirectParam(MASTER)).toBe(MASTER);
  });
});

describe("fileURL", () => {
  it("derives the file tier from a master URL", () => {
    expect(fileURL(MASTER)).toBe(FILE);
    expect(fileURL(`${MASTER}?direct=1`)).toBe(FILE);
  });

  it("preserves server-issued params but drops direct", () => {
    expect(fileURL(`${MASTER}?token=a%2Bb&direct=1`)).toBe(
      `${FILE}?token=a%2Bb`,
    );
  });

  it("passes a file URL through and rejects non-stream URLs", () => {
    expect(fileURL(FILE)).toBe(FILE);
    expect(fileURL("https://cdn.example.com/clip.mp4")).toBeNull();
  });
});

describe("isFileTierURL", () => {
  it("identifies file-tier URLs only", () => {
    expect(isFileTierURL(FILE)).toBe(true);
    expect(isFileTierURL(`${FILE}?token=x`)).toBe(true);
    expect(isFileTierURL(MASTER)).toBe(false);
    expect(isFileTierURL(null)).toBe(false);
  });
});

describe("canonicalVideoId", () => {
  it("reverses every tier mutation back to the delivered master URL", () => {
    expect(canonicalVideoId(MASTER)).toBe(MASTER);
    expect(canonicalVideoId(`${MASTER}?direct=1`)).toBe(MASTER);
    expect(canonicalVideoId(FILE)).toBe(MASTER);
    expect(canonicalVideoId(`${FILE}?token=a%2Bb`)).toBe(
      `${MASTER}?token=a%2Bb`,
    );
    expect(canonicalVideoId(`${MASTER}?token=a%2Bb&direct=1&x=1`)).toBe(
      MASTER_WITH_TOKEN,
    );
  });

  it("leaves non-stream URLs unchanged", () => {
    expect(canonicalVideoId("https://cdn.example.com/clip.mp4")).toBe(
      "https://cdn.example.com/clip.mp4",
    );
  });
});

describe("withDirectOnlyParam / isDirectOnlyURL", () => {
  const master = "https://t.example.com/stream/abc/master.m3u8";

  it("adds direct=only, replacing any other direct value, idempotently", () => {
    expect(withDirectOnlyParam(master)).toBe(`${master}?direct=only`);
    expect(withDirectOnlyParam(`${master}?direct=1`)).toBe(
      `${master}?direct=only`,
    );
    expect(withDirectOnlyParam(`${master}?direct=only`)).toBe(
      `${master}?direct=only`,
    );
    expect(withDirectOnlyParam(`${master}?token=x&direct=1#f`)).toBe(
      `${master}?token=x&direct=only#f`,
    );
  });

  it("leaves non-master URLs alone", () => {
    expect(withDirectOnlyParam("https://t.example.com/stream/abc/file")).toBe(
      "https://t.example.com/stream/abc/file",
    );
    expect(withDirectOnlyParam("https://cdn.example.com/clip.mp4")).toBe(
      "https://cdn.example.com/clip.mp4",
    );
  });

  it("recognises the pinned master and nothing else", () => {
    expect(isDirectOnlyURL(`${master}?direct=only`)).toBe(true);
    expect(isDirectOnlyURL(`${master}?token=x&direct=only`)).toBe(true);
    expect(isDirectOnlyURL(`${master}?direct=1`)).toBe(false);
    expect(isDirectOnlyURL(master)).toBe(false);
    expect(
      isDirectOnlyURL("https://t.example.com/stream/abc/file?direct=only"),
    ).toBe(false);
    expect(isDirectOnlyURL(null)).toBe(false);
  });

  it("strips and canonicalises direct=only like any other direct value", () => {
    expect(stripDirectParam(`${master}?direct=only`)).toBe(master);
    expect(canonicalVideoId(`${master}?direct=only`)).toBe(
      canonicalVideoId(`${master}?direct=1`),
    );
  });
});
