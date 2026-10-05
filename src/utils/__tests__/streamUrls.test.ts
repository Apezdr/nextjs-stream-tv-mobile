import {
  describeStreamTier,
  isDirectOnlyURL,
  withDirectOnlyParam,
  canonicalVideoId,
  fileURL,
  getStreamKey,
  isFileTierURL,
  stripDirectParam,
  stripRangeParam,
  withDirectParam,
  withRangeParam,
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

  it("drops the range too, from masters and file URLs alike", () => {
    expect(fileURL(`${MASTER}?token=a%2Bb&range=pq&direct=1`)).toBe(
      `${FILE}?token=a%2Bb`,
    );
    expect(fileURL(`${MASTER}?range=sdr`)).toBe(FILE);
    expect(fileURL(`${FILE}?range=pq&token=a%2Bb`)).toBe(`${FILE}?token=a%2Bb`);
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

  it("ignores the range, so a range change never reads as a new item", () => {
    const id = canonicalVideoId(MASTER_WITH_TOKEN);
    expect(id).toBe(MASTER_WITH_TOKEN);
    expect(canonicalVideoId(`${MASTER_WITH_TOKEN}&range=pq&direct=1`)).toBe(id);
    expect(canonicalVideoId(`${MASTER_WITH_TOKEN}&range=sdr`)).toBe(id);
    expect(canonicalVideoId(`${FILE}?token=a%2Bb&x=1&range=pq`)).toBe(id);
  });

  it("removes repeated controls wherever they sit, keeping the rest in order", () => {
    expect(
      canonicalVideoId(
        `${MASTER}?range=pq&token=a%2Bb&direct=1&range=sdr&x=1&direct=only#t=5`,
      ),
    ).toBe(`${MASTER_WITH_TOKEN}#t=5`);
  });

  it("leaves non-stream URLs unchanged", () => {
    expect(canonicalVideoId("https://cdn.example.com/clip.mp4")).toBe(
      "https://cdn.example.com/clip.mp4",
    );
  });

  it("keeps a range param that is not ours", () => {
    expect(
      canonicalVideoId("https://cdn.example.com/clip.mp4?range=0-99"),
    ).toBe("https://cdn.example.com/clip.mp4?range=0-99");
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

describe("withRangeParam / stripRangeParam", () => {
  it("asks for either range on a bare master", () => {
    expect(withRangeParam(MASTER, "pq")).toBe(`${MASTER}?range=pq`);
    expect(withRangeParam(MASTER, "sdr")).toBe(`${MASTER}?range=sdr`);
  });

  it("preserves other params byte-for-byte, and the fragment", () => {
    expect(withRangeParam(MASTER_WITH_TOKEN, "pq")).toBe(
      `${MASTER}?token=a%2Bb&x=1&range=pq`,
    );
    expect(withRangeParam(`${MASTER_WITH_TOKEN}#t=5`, "sdr")).toBe(
      `${MASTER}?token=a%2Bb&x=1&range=sdr#t=5`,
    );
  });

  it("is idempotent and replaces every existing range entry", () => {
    expect(withRangeParam(withRangeParam(MASTER, "pq"), "pq")).toBe(
      `${MASTER}?range=pq`,
    );
    expect(withRangeParam(withRangeParam(MASTER_WITH_TOKEN, "pq"), "sdr")).toBe(
      `${MASTER}?token=a%2Bb&x=1&range=sdr`,
    );
    expect(
      withRangeParam(`${MASTER}?range=pq&token=a%2Bb&range=sdr&range`, "pq"),
    ).toBe(`${MASTER}?token=a%2Bb&range=pq`);
  });

  it("does not touch a range-like param on another key", () => {
    expect(withRangeParam(`${MASTER}?arrange=1&ranges=2`, "pq")).toBe(
      `${MASTER}?arrange=1&ranges=2&range=pq`,
    );
    expect(stripRangeParam(`${MASTER}?arrange=1&ranges=2`)).toBe(
      `${MASTER}?arrange=1&ranges=2`,
    );
  });

  it("strips the range back to the mixed master", () => {
    expect(stripRangeParam(`${MASTER}?range=pq`)).toBe(MASTER);
    expect(stripRangeParam(`${MASTER}?token=a%2Bb&range=sdr&x=1#t=5`)).toBe(
      `${MASTER_WITH_TOKEN}#t=5`,
    );
    expect(stripRangeParam(MASTER_WITH_TOKEN)).toBe(MASTER_WITH_TOKEN);
  });

  it("leaves non-master URLs unchanged, range and all", () => {
    const clip = "https://cdn.example.com/clip.mp4?range=0-99";
    expect(withRangeParam(FILE, "pq")).toBe(FILE);
    expect(withRangeParam(clip, "pq")).toBe(clip);
    expect(stripRangeParam(clip)).toBe(clip);
    expect(stripRangeParam(`${FILE}?range=pq`)).toBe(`${FILE}?range=pq`);
  });
});

describe("tier and range controls together", () => {
  const PQ_TRANSCODE = `${MASTER}?token=a%2Bb&x=1&range=pq`;
  const PQ_AUTO = `${PQ_TRANSCODE}&direct=1`;

  it("Auto and Transcoded only keep the selected range", () => {
    expect(withDirectParam(PQ_TRANSCODE)).toBe(PQ_AUTO);
    expect(stripDirectParam(PQ_AUTO)).toBe(PQ_TRANSCODE);
    expect(withDirectParam(`${MASTER}?range=sdr&direct=0`)).toBe(
      `${MASTER}?range=sdr&direct=1`,
    );
  });

  it("spells one selection one way, whichever helper ran last", () => {
    expect(withDirectParam(withRangeParam(MASTER_WITH_TOKEN, "pq"))).toBe(
      PQ_AUTO,
    );
    expect(withRangeParam(withDirectParam(MASTER_WITH_TOKEN), "pq")).toBe(
      PQ_AUTO,
    );
    expect(withDirectParam(stripDirectParam(PQ_AUTO))).toBe(PQ_AUTO);
    expect(withRangeParam(withRangeParam(PQ_AUTO, "sdr"), "pq")).toBe(PQ_AUTO);
    expect(stripRangeParam(PQ_AUTO)).toBe(withDirectParam(MASTER_WITH_TOKEN));
  });

  it("switches PQ to SDR in place without duplicating a control", () => {
    expect(withRangeParam(PQ_AUTO, "sdr")).toBe(
      `${MASTER}?token=a%2Bb&x=1&range=sdr&direct=1`,
    );
    expect(withRangeParam(PQ_TRANSCODE, "sdr")).toBe(
      `${MASTER}?token=a%2Bb&x=1&range=sdr`,
    );
  });

  it("Original and the raw file never carry a range", () => {
    const switched = withRangeParam(PQ_AUTO, "sdr");
    for (const selected of [PQ_AUTO, PQ_TRANSCODE, switched]) {
      expect(withDirectOnlyParam(selected)).toBe(
        `${MASTER}?token=a%2Bb&x=1&direct=only`,
      );
      expect(fileURL(selected)).toBe(`${FILE}?token=a%2Bb&x=1`);
    }
    expect(
      withDirectOnlyParam(
        `${MASTER}?range=pq&token=a%2Bb&direct=1&range=sdr#t=5`,
      ),
    ).toBe(`${MASTER}?token=a%2Bb&direct=only#t=5`);
  });

  it("will not put a range on the pinned Original master", () => {
    const pinned = withDirectOnlyParam(MASTER_WITH_TOKEN);
    expect(withRangeParam(pinned, "pq")).toBe(pinned);
    expect(withRangeParam(`${MASTER}?range=sdr&direct=only`, "pq")).toBe(
      `${MASTER}?direct=only`,
    );
  });
});

describe("describeStreamTier", () => {
  it("names the requested range beside the tier", () => {
    expect(describeStreamTier(withRangeParam(MASTER_WITH_TOKEN, "pq"))).toBe(
      "hls:range=pq",
    );
    expect(
      describeStreamTier(withDirectParam(withRangeParam(MASTER, "sdr"))),
    ).toBe("hls:direct=1,range=sdr");
    expect(describeStreamTier(`${FILE}?range=pq`)).toBe("file");
  });

  it("flags a repeated or unrecognized range without echoing it", () => {
    expect(describeStreamTier(`${MASTER}?range=pq&range=sdr`)).toBe(
      "hls:range=invalid",
    );
    expect(describeStreamTier(`${MASTER}?range=hdr`)).toBe("hls:range=invalid");
    expect(describeStreamTier(`${MASTER}?range=PQ&direct=1`)).toBe(
      "hls:direct=1,range=invalid",
    );
  });

  it("names the tier without leaking the host or key", () => {
    expect(describeStreamTier(MASTER)).toBe("hls");
    expect(describeStreamTier(MASTER_WITH_TOKEN)).toBe("hls");
    expect(describeStreamTier(withDirectParam(MASTER))).toBe("hls:direct=1");
    expect(describeStreamTier(withDirectOnlyParam(MASTER_WITH_TOKEN))).toBe(
      "hls:direct=only",
    );
    expect(describeStreamTier(FILE)).toBe("file");
    for (const url of [MASTER, MASTER_WITH_TOKEN, FILE]) {
      expect(describeStreamTier(url)).not.toContain("abc123");
      expect(describeStreamTier(url)).not.toContain("transcoder");
    }
  });

  it("handles missing and non-stream URLs", () => {
    expect(describeStreamTier(null)).toBe("none");
    expect(describeStreamTier(undefined)).toBe("none");
    expect(describeStreamTier("")).toBe("none");
    expect(describeStreamTier("https://cdn.example.com/banner.mp4")).toBe(
      "other",
    );
  });
});
