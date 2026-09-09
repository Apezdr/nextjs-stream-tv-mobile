import type { VideoPlayer } from "expo-video";

import { applyResumePosition, isResumePending } from "./resumeGuard";

type Listener = (payload: any) => void;

/**
 * Minimal stand-in for expo-video's player: records seeks, and lets a test
 * emit the events the guard listens to.
 */
function fakePlayer(initialTime = 0) {
  const listeners: Record<string, Listener[]> = {};
  const seeks: number[] = [];
  let time = initialTime;
  const player = {
    get currentTime() {
      return time;
    },
    set currentTime(t: number) {
      seeks.push(t);
      time = t;
    },
    addListener: jest.fn((event: string, cb: Listener) => {
      (listeners[event] ??= []).push(cb);
      return {
        remove: () => {
          listeners[event] = (listeners[event] ?? []).filter((l) => l !== cb);
        },
      };
    }),
  };
  const emit = (event: string, payload: any) =>
    (listeners[event] ?? []).forEach((l) => l(payload));
  const listenerCount = (event: string) => (listeners[event] ?? []).length;
  // Moves the reported position without recording a seek (what a source
  // commit or playback does).
  const setTime = (t: number) => {
    time = t;
  };
  return {
    player: player as unknown as VideoPlayer,
    seeks,
    emit,
    listenerCount,
    setTime,
  };
}

describe("applyResumePosition", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("seeks immediately and again when the source commits", () => {
    const { player, seeks, emit } = fakePlayer();
    applyResumePosition(player, 4468);
    expect(seeks).toEqual([4468]);
    emit("sourceChange", {});
    expect(seeks).toEqual([4468, 4468]);
  });

  it("re-seeks on the first ready when the position was reset away", () => {
    const { player, seeks, emit, setTime, listenerCount } = fakePlayer();
    applyResumePosition(player, 4468);
    setTime(4.4); // the commit reset the position and playback began
    emit("statusChange", { status: "readyToPlay" });
    expect(seeks).toEqual([4468, 4468]);
    // The guard is one-shot: nothing is left listening.
    expect(listenerCount("statusChange")).toBe(0);
    expect(listenerCount("sourceChange")).toBe(0);
  });

  it("leaves a good landing alone and disarms", () => {
    const { player, seeks, emit, setTime, listenerCount } = fakePlayer();
    applyResumePosition(player, 4468);
    setTime(4466); // keyframe snap, within tolerance
    emit("statusChange", { status: "readyToPlay" });
    expect(seeks).toEqual([4468]);
    expect(listenerCount("statusChange")).toBe(0);
  });

  it("ignores non-ready statuses and errors", () => {
    const { player, seeks, emit, setTime } = fakePlayer();
    applyResumePosition(player, 4468);
    setTime(0);
    emit("statusChange", { status: "loading" });
    emit("statusChange", { status: "readyToPlay", error: { message: "x" } });
    expect(seeks).toEqual([4468]);
  });

  it("does nothing for a zero or negative target", () => {
    const { player, seeks, listenerCount } = fakePlayer();
    applyResumePosition(player, 0);
    expect(seeks).toEqual([]);
    expect(listenerCount("statusChange")).toBe(0);
  });

  it("disarms itself after the TTL and via the disposer", () => {
    const { player, listenerCount } = fakePlayer();
    const dispose = applyResumePosition(player, 100);
    expect(listenerCount("statusChange")).toBe(1);
    jest.advanceTimersByTime(30_000);
    expect(listenerCount("statusChange")).toBe(0);

    const second = fakePlayer();
    const dispose2 = applyResumePosition(second.player, 100);
    dispose2();
    expect(second.listenerCount("sourceChange")).toBe(0);
    dispose(); // idempotent
  });
});

describe("isResumePending", () => {
  it("reports a pending seek from arm until the guard disposes", () => {
    const { player, emit } = fakePlayer(0);
    expect(isResumePending(player as any)).toBe(false);

    const dispose = applyResumePosition(player as any, 100, "test");
    expect(isResumePending(player as any)).toBe(true);

    // A second guard on the same player keeps it pending until BOTH clear.
    const disposeSecond = applyResumePosition(player as any, 100, "test");
    dispose();
    expect(isResumePending(player as any)).toBe(true);

    emit("statusChange", { status: "readyToPlay" });
    expect(isResumePending(player as any)).toBe(false);
    disposeSecond(); // idempotent
    expect(isResumePending(player as any)).toBe(false);
  });

  it("is never pending for a zero target (no guard is armed)", () => {
    const { player } = fakePlayer(0);
    applyResumePosition(player as any, 0, "test");
    expect(isResumePending(player as any)).toBe(false);
  });
});
