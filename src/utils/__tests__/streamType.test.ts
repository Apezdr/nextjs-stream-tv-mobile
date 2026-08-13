import { isAdaptiveStreamURL } from "../streamType";

describe("isAdaptiveStreamURL", () => {
  it("detects HLS playlists by extension", () => {
    expect(isAdaptiveStreamURL("https://cdn.example.com/master.m3u8")).toBe(
      true,
    );
    expect(isAdaptiveStreamURL("https://cdn.example.com/MASTER.M3U8")).toBe(
      true,
    );
  });

  it("detects DASH manifests by extension", () => {
    expect(isAdaptiveStreamURL("https://cdn.example.com/manifest.mpd")).toBe(
      true,
    );
  });

  it("ignores query strings and fragments", () => {
    expect(
      isAdaptiveStreamURL("https://cdn.example.com/master.m3u8?token=abc.mp4"),
    ).toBe(true);
    expect(
      isAdaptiveStreamURL("https://cdn.example.com/master.m3u8#t=10"),
    ).toBe(true);
    expect(
      isAdaptiveStreamURL("https://cdn.example.com/video.mp4?playlist=x.m3u8"),
    ).toBe(false);
  });

  it("rejects progressive sources", () => {
    expect(isAdaptiveStreamURL("https://cdn.example.com/video.mp4")).toBe(
      false,
    );
    expect(isAdaptiveStreamURL("https://cdn.example.com/video.mkv")).toBe(
      false,
    );
  });

  it("rejects empty and nullish input", () => {
    expect(isAdaptiveStreamURL(null)).toBe(false);
    expect(isAdaptiveStreamURL(undefined)).toBe(false);
    expect(isAdaptiveStreamURL("")).toBe(false);
  });
});
