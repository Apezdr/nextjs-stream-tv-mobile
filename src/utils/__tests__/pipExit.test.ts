import { createPipExitArbiter, PipExitOutcome } from "../pipExit";

describe("createPipExitArbiter", () => {
  const GRACE = 1500;
  let outcomes: PipExitOutcome[];

  const make = () => {
    outcomes = [];
    return createPipExitArbiter({
      graceMs: GRACE,
      onOutcome: (o) => outcomes.push(o),
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("calls an expand at once when the app is already active", () => {
    const arbiter = make();
    arbiter.onPipStop("active");
    expect(outcomes).toEqual(["expanded"]);
    expect(arbiter.pending).toBe(false);
  });

  it("calls an expand when the app resumes within the grace window", () => {
    const arbiter = make();
    arbiter.onPipStop("background");
    expect(arbiter.pending).toBe(true);
    expect(outcomes).toEqual([]);

    jest.advanceTimersByTime(GRACE - 1);
    arbiter.onAppStateChange("active");
    expect(outcomes).toEqual(["expanded"]);
    expect(arbiter.pending).toBe(false);

    // The grace timer is gone: no late "dismissed" verdict.
    jest.advanceTimersByTime(GRACE * 2);
    expect(outcomes).toEqual(["expanded"]);
  });

  it("calls a dismissal when the app stays in the background", () => {
    const arbiter = make();
    arbiter.onPipStop("background");
    jest.advanceTimersByTime(GRACE - 1);
    expect(outcomes).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(outcomes).toEqual(["dismissed"]);
    expect(arbiter.pending).toBe(false);
  });

  it("ignores app state changes that are not a resume", () => {
    const arbiter = make();
    arbiter.onPipStop("background");
    arbiter.onAppStateChange("inactive");
    arbiter.onAppStateChange("background");
    expect(outcomes).toEqual([]);
    jest.advanceTimersByTime(GRACE);
    expect(outcomes).toEqual(["dismissed"]);
  });

  it("ignores a resume with no PiP stop pending", () => {
    const arbiter = make();
    arbiter.onAppStateChange("active");
    expect(outcomes).toEqual([]);
  });

  it("drops the pending verdict on cancel", () => {
    const arbiter = make();
    arbiter.onPipStop("background");
    arbiter.cancel();
    expect(arbiter.pending).toBe(false);
    jest.advanceTimersByTime(GRACE);
    arbiter.onAppStateChange("active");
    expect(outcomes).toEqual([]);
  });

  it("restarts the grace window on a second stop", () => {
    const arbiter = make();
    arbiter.onPipStop("background");
    jest.advanceTimersByTime(GRACE - 100);
    arbiter.onPipStop("background");
    jest.advanceTimersByTime(100);
    expect(outcomes).toEqual([]);
    jest.advanceTimersByTime(GRACE - 100);
    expect(outcomes).toEqual(["dismissed"]);
  });
});
