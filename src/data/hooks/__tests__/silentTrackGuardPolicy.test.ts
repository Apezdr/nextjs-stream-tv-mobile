import {
  SilentGuardSnapshot,
  accumulateClock,
  decideSilentFailure,
} from "@/src/data/hooks/silentTrackGuardPolicy";

const AV1_UNSUPPORTED = { id: "1", mimeType: "video/av01", isSupported: false };
const AVC_OK = { id: "main:2", mimeType: "video/avc", isSupported: true };
const DTS_OK = { id: "2", isSupported: true };

function snapshot(
  overrides: Partial<SilentGuardSnapshot> = {},
): SilentGuardSnapshot {
  return {
    platformClass: "android-tv",
    appActive: true,
    inPictureInPicture: false,
    viewMounted: true,
    status: "readyToPlay",
    playing: true,
    isSwitching: false,
    isHandlingError: false,
    clockAdvancedSec: 0,
    firstFrameSeen: false,
    videoTracks: [AV1_UNSUPPORTED],
    videoTrackSelected: false,
    audioTracks: [DTS_OK],
    audioTrackSelected: true,
    audioRetryDone: false,
    alreadyDecided: new Set(),
    ...overrides,
  };
}

describe("decideSilentFailure (video)", () => {
  it("calls the raw AV1 file unsupported after three seconds of running clock", () => {
    expect(decideSilentFailure(snapshot({ clockAdvancedSec: 3 }))).toEqual({
      verdict: "video-unsupported",
      action: "descend-or-card",
    });
    expect(decideSilentFailure(snapshot({ clockAdvancedSec: 2.9 }))).toBeNull();
  });

  it("stays quiet while a supported rung plays, even with an unsupported rung listed", () => {
    const mixed = snapshot({
      videoTracks: [AV1_UNSUPPORTED, AVC_OK],
      videoTrackSelected: true,
      firstFrameSeen: true,
      clockAdvancedSec: 30,
    });
    expect(decideSilentFailure(mixed)).toBeNull();
  });

  it("does not call a mixed list unsupported, but reports an unselected one at six seconds", () => {
    const base = {
      videoTracks: [AV1_UNSUPPORTED, AVC_OK],
      videoTrackSelected: false,
    };
    expect(
      decideSilentFailure(snapshot({ ...base, clockAdvancedSec: 3 })),
    ).toBeNull();
    expect(
      decideSilentFailure(snapshot({ ...base, clockAdvancedSec: 6 })),
    ).toEqual({
      verdict: "video-unselected",
      action: "report-only",
    });
  });

  it("reports, never acts on, nothing rendered after eight seconds (a DV rung can play with both signals missing)", () => {
    const base = { videoTracks: [AVC_OK], clockAdvancedSec: 8 };
    expect(
      decideSilentFailure(snapshot({ ...base, videoTrackSelected: true })),
    ).toBeNull();
    expect(
      decideSilentFailure(snapshot({ ...base, videoTrackSelected: false })),
    ).toEqual({
      verdict: "video-not-rendering",
      action: "report-only",
    });
  });

  it("only reports on Apple, where the first frame is the single signal", () => {
    const apple = snapshot({
      platformClass: "apple-tv",
      videoTracks: [{ id: "0", mimeType: null, isSupported: null }],
      videoTrackSelected: true,
      clockAdvancedSec: 8,
    });
    expect(decideSilentFailure(apple)).toEqual({
      verdict: "video-not-rendering",
      action: "report-only",
    });
    expect(decideSilentFailure({ ...apple, clockAdvancedSec: 7.9 })).toBeNull();
    expect(
      decideSilentFailure({
        ...apple,
        clockAdvancedSec: 3,
        videoTracks: [AV1_UNSUPPORTED],
      }),
    ).toBeNull();
  });

  it("skips the video rules for an audio-only source", () => {
    expect(
      decideSilentFailure(snapshot({ videoTracks: [], clockAdvancedSec: 60 })),
    ).toBeNull();
  });

  it("forms no verdict at startup, before the clock has run", () => {
    expect(decideSilentFailure(snapshot({ clockAdvancedSec: 1.5 }))).toBeNull();
  });

  it("forms no verdict while backgrounded, in PiP, unmounted, paused, loading, switching or recovering", () => {
    const ready = { clockAdvancedSec: 10 };
    expect(
      decideSilentFailure(snapshot({ ...ready, appActive: false })),
    ).toBeNull();
    expect(
      decideSilentFailure(snapshot({ ...ready, inPictureInPicture: true })),
    ).toBeNull();
    expect(
      decideSilentFailure(snapshot({ ...ready, viewMounted: false })),
    ).toBeNull();
    expect(
      decideSilentFailure(snapshot({ ...ready, playing: false })),
    ).toBeNull();
    expect(
      decideSilentFailure(snapshot({ ...ready, status: "loading" })),
    ).toBeNull();
    expect(
      decideSilentFailure(snapshot({ ...ready, isSwitching: true })),
    ).toBeNull();
    expect(
      decideSilentFailure(snapshot({ ...ready, isHandlingError: true })),
    ).toBeNull();
    expect(
      decideSilentFailure(snapshot({ ...ready, platformClass: "web" })),
    ).toBeNull();
  });

  it("returns each verdict once per source", () => {
    expect(
      decideSilentFailure(
        snapshot({
          clockAdvancedSec: 10,
          alreadyDecided: new Set(["video-unsupported"]),
        }),
      ),
    ).toEqual({ verdict: "video-not-rendering", action: "report-only" });
    expect(
      decideSilentFailure(
        snapshot({
          clockAdvancedSec: 10,
          alreadyDecided: new Set(["video-unsupported", "video-not-rendering"]),
        }),
      ),
    ).toBeNull();
  });
});

describe("decideSilentFailure (audio)", () => {
  const silentVideoOk = {
    videoTracks: [AVC_OK],
    videoTrackSelected: true,
    firstFrameSeen: true,
    audioTrackSelected: false,
  };

  it("tries a sibling track at three seconds, then acts at six", () => {
    expect(
      decideSilentFailure(snapshot({ ...silentVideoOk, clockAdvancedSec: 3 })),
    ).toEqual({
      verdict: "audio-unselected",
      action: "audio-retry",
    });
    expect(
      decideSilentFailure(
        snapshot({
          ...silentVideoOk,
          clockAdvancedSec: 5,
          audioRetryDone: true,
        }),
      ),
    ).toBeNull();
    expect(
      decideSilentFailure(
        snapshot({
          ...silentVideoOk,
          clockAdvancedSec: 6,
          audioRetryDone: true,
        }),
      ),
    ).toEqual({ verdict: "audio-unselected", action: "descend-or-card" });
  });

  it("is quiet when a track is selected or none are listed", () => {
    expect(
      decideSilentFailure(
        snapshot({
          ...silentVideoOk,
          audioTrackSelected: true,
          clockAdvancedSec: 30,
        }),
      ),
    ).toBeNull();
    expect(
      decideSilentFailure(
        snapshot({ ...silentVideoOk, audioTracks: [], clockAdvancedSec: 30 }),
      ),
    ).toBeNull();
  });
});

describe("accumulateClock", () => {
  it("adds ordinary playback steps and ignores jumps, seeks back and the first sample", () => {
    expect(accumulateClock(null, 12)).toBe(0);
    expect(accumulateClock(12, 13)).toBe(1);
    expect(accumulateClock(13, 13.5)).toBe(0.5);
    expect(accumulateClock(13.5, 4482)).toBe(0);
    expect(accumulateClock(4482, 4470)).toBe(0);
    expect(accumulateClock(10, 10)).toBe(0);
    expect(accumulateClock(10, Number.NaN)).toBe(0);
  });
});
