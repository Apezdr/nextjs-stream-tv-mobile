import { createPipExitArbiter, PipExitOutcome } from "../pipExit";

describe("createPipExitArbiter", () => {
  const GRACE = 1500;
  let outcomes: PipExitOutcome[];
  let clock: number;

  const make = () => {
    outcomes = [];
    clock = 100_000;
    return createPipExitArbiter({
      graceMs: GRACE,
      onOutcome: (o) => outcomes.push(o),
      now: () => clock,
    });
  };

  it("calls an expand at once when the app is already active", () => {
    const arbiter = make();
    arbiter.onPipStop("active");
    expect(outcomes).toEqual(["expanded"]);
    expect(arbiter.pending).toBe(false);
  });

  it("pauses at once on a background stop, then resumes on a prompt expand", () => {
    const arbiter = make();
    arbiter.onPipStop("background");
    expect(outcomes).toEqual(["dismissed"]);
    expect(arbiter.pending).toBe(true);

    clock += GRACE - 1;
    arbiter.onAppStateChange("active");
    expect(outcomes).toEqual(["dismissed", "expanded"]);
    expect(arbiter.pending).toBe(false);
  });

  it("stays a dismissal when the app stays in the background", () => {
    const arbiter = make();
    arbiter.onPipStop("background");
    clock += GRACE + 1;
    expect(arbiter.pending).toBe(false);
    arbiter.onAppStateChange("active");
    expect(outcomes).toEqual(["dismissed"]);
  });

  it("needs no timer: a frozen clock still yields the dismissal", () => {
    const arbiter = make();
    arbiter.onPipStop("background");
    expect(outcomes).toEqual(["dismissed"]);
  });

  it("ignores app state changes that are not a resume", () => {
    const arbiter = make();
    arbiter.onPipStop("background");
    arbiter.onAppStateChange("inactive");
    arbiter.onAppStateChange("background");
    expect(outcomes).toEqual(["dismissed"]);
    expect(arbiter.pending).toBe(true);
  });

  it("ignores a resume with no PiP stop pending", () => {
    const arbiter = make();
    arbiter.onAppStateChange("active");
    expect(outcomes).toEqual([]);
  });

  it("drops the open expand window on cancel", () => {
    const arbiter = make();
    arbiter.onPipStop("background");
    arbiter.cancel();
    expect(arbiter.pending).toBe(false);
    arbiter.onAppStateChange("active");
    expect(outcomes).toEqual(["dismissed"]);
  });

  it("restarts the expand window on a second stop", () => {
    const arbiter = make();
    arbiter.onPipStop("background");
    clock += GRACE - 100;
    arbiter.onPipStop("background");
    clock += 200;
    arbiter.onAppStateChange("active");
    expect(outcomes).toEqual(["dismissed", "dismissed", "expanded"]);
  });
});
