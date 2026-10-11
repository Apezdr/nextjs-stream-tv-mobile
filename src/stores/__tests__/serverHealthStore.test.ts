import {
  CONFIRM_INTERVAL_MS,
  ONLINE_RESUME_DELAY_MS,
  PROBE_DEBOUNCE_MS,
  PROBE_TIMEOUT_MS,
  RECOVERY_INTERVAL_MS,
  selectHealthNotice,
  serverHealth,
  useServerHealthStore,
  type Episode,
} from "../serverHealthStore";

type FetchMode = "ok" | "503" | "502" | "network" | "hang" | "manual";
let fetchMode: FetchMode = "ok";
/** In "manual" mode the probe stays open until the test answers it. */
let manualRespond: ((status: number) => void) | null = null;

const fetchMock = jest.fn(
  (_url: string, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const respond = (status: number) =>
        resolve({
          ok: status >= 200 && status < 300,
          status,
          headers: {
            get: (name: string) => (name === "cf-ray" ? "ray" : null),
          },
        } as unknown as Response);
      switch (fetchMode) {
        case "ok":
          return respond(200);
        case "503":
          return respond(503);
        case "502":
          return respond(502);
        case "network":
          return reject(new TypeError("Network request failed"));
        case "manual":
          manualRespond = respond;
          return;
        case "hang":
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          });
      }
    }),
);

const state = () => useServerHealthStore.getState();
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

let ended: Episode[] = [];

beforeEach(() => {
  jest.useFakeTimers();
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockClear();
  fetchMode = "ok";
  manualRespond = null;
  ended = [];
  // configure() resets only on a change, so go through null to start clean.
  serverHealth.configure({ server: null });
  serverHealth.configure({ server: "https://example.test/" });
  serverHealth.setOnline(true);
  serverHealth.setHooks({ onEpisodeEnded: (episode) => ended.push(episode) });
});

afterEach(() => {
  serverHealth.setHooks({});
  jest.useRealTimers();
});

describe("serverHealth", () => {
  it("one failed request sends one probe; a passing probe closes the episode quietly", async () => {
    serverHealth.noteFailure({ url: "/api/authenticated/search", status: 502 });
    expect(state().reachability).toBe("suspect");
    expect(fetchMock).not.toHaveBeenCalled();

    await advance(PROBE_DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/example\.test\/api\/status\?_=\d+$/);
    expect(init?.cache).toBe("no-store");
    expect(init?.credentials).toBe("omit");

    expect(state().reachability).toBe("ok");
    expect(state().episode).toBeNull();
    // The server answered: nothing to refetch, nothing to report.
    expect(ended).toHaveLength(0);
  });

  it("two failed probes show the banner; the first success clears it and reports", async () => {
    fetchMode = "network";
    serverHealth.noteFailure({
      url: "/api/authenticated/search",
      code: "ERR_NETWORK",
    });

    await advance(PROBE_DEBOUNCE_MS);
    expect(state().reachability).toBe("suspect");
    expect(selectHealthNotice(state())).toBeNull();

    await advance(CONFIRM_INTERVAL_MS);
    expect(state().reachability).toBe("unreachable");
    expect(selectHealthNotice(state())?.kind).toBe("unreachable");

    fetchMode = "ok";
    await advance(RECOVERY_INTERVAL_MS);
    expect(state().reachability).toBe("ok");
    expect(selectHealthNotice(state())).toBeNull();

    expect(ended).toHaveLength(1);
    const episode = ended[0];
    expect(episode.bannerShown).toBe(true);
    expect(episode.serverWasUnreachable).toBe(true);
    expect(episode.recoveredBy).toBe("probe");
    expect(episode.failedRequests).toBe(1);
    expect(episode.probes.map((p) => p.outcome)).toEqual([
      "network",
      "network",
      "ok",
    ]);
    expect((episode.endedAt ?? 0) - episode.startedAt).toBe(
      PROBE_DEBOUNCE_MS + CONFIRM_INTERVAL_MS + RECOVERY_INTERVAL_MS,
    );
  });

  it("a hanging probe is cut off at the timeout and counted as one", async () => {
    fetchMode = "hang";
    serverHealth.noteFailure({
      url: "/api/authenticated/media",
      code: "ECONNABORTED",
    });
    await advance(PROBE_DEBOUNCE_MS);
    await advance(PROBE_TIMEOUT_MS);
    expect(state().reachability).toBe("suspect");
    expect(state().episode?.probes[0]).toMatchObject({
      outcome: "timeout",
      elapsedMs: PROBE_TIMEOUT_MS,
    });
  });

  it("any successful request recovers at once and cancels the pending probe", async () => {
    fetchMode = "network";
    serverHealth.noteFailure({
      url: "/api/authenticated/search",
      code: "ERR_NETWORK",
    });
    await advance(PROBE_DEBOUNCE_MS);
    expect(state().reachability).toBe("suspect");

    serverHealth.noteSuccess();
    expect(state().reachability).toBe("ok");
    expect(ended).toHaveLength(1);
    expect(ended[0].recoveredBy).toBe("request");
    expect(ended[0].bannerShown).toBe(false);

    const sent = fetchMock.mock.calls.length;
    await advance(CONFIRM_INTERVAL_MS + RECOVERY_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(sent);
  });

  it("a 503 shows the database notice and keeps asking", async () => {
    fetchMode = "503";
    serverHealth.noteFailure({ url: "/api/authenticated/list", status: 503 });
    await advance(PROBE_DEBOUNCE_MS);
    expect(state().reachability).toBe("degraded");
    expect(selectHealthNotice(state())?.kind).toBe("degraded");

    await advance(RECOVERY_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(state().reachability).toBe("degraded");

    fetchMode = "ok";
    await advance(RECOVERY_INTERVAL_MS);
    expect(state().reachability).toBe("ok");
    expect(ended[0].probes.map((p) => p.outcome)).toEqual([
      "degraded",
      "degraded",
      "ok",
    ]);
  });

  it("while offline nothing is blamed on the server and no probe is sent", async () => {
    serverHealth.setOnline(false);
    expect(selectHealthNotice(state())?.kind).toBe("offline");

    serverHealth.noteFailure({
      url: "/api/authenticated/search",
      code: "ERR_NETWORK",
    });
    await advance(PROBE_DEBOUNCE_MS);
    expect(state().reachability).toBe("ok");
    expect(fetchMock).not.toHaveBeenCalled();

    serverHealth.setOnline(true);
    await advance(ONLINE_RESUME_DELAY_MS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("going offline pauses an open episode; coming back probes it to a close", async () => {
    fetchMode = "network";
    serverHealth.noteFailure({
      url: "/api/authenticated/search",
      code: "ERR_NETWORK",
    });
    await advance(PROBE_DEBOUNCE_MS);
    expect(state().reachability).toBe("suspect");

    serverHealth.setOnline(false);
    await advance(CONFIRM_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state().episode?.wentOffline).toBe(true);

    fetchMode = "ok";
    serverHealth.setOnline(true);
    await advance(ONLINE_RESUME_DELAY_MS);
    expect(state().reachability).toBe("ok");
    expect(ended[0].wentOffline).toBe(true);
  });

  it("a probe that finishes after the device went offline is not counted", async () => {
    fetchMode = "hang";
    serverHealth.noteFailure({
      url: "/api/authenticated/search",
      code: "ERR_NETWORK",
    });
    await advance(PROBE_DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    serverHealth.setOnline(false);
    await advance(PROBE_TIMEOUT_MS);
    expect(state().reachability).toBe("suspect");
    expect(state().episode?.probes).toHaveLength(0);

    fetchMode = "ok";
    serverHealth.setOnline(true);
    await advance(ONLINE_RESUME_DELAY_MS);
    expect(state().reachability).toBe("ok");
    // The server was never shown to be unreachable: closed quietly, no banner
    // flash on reconnect, nothing reported.
    expect(ended).toHaveLength(0);
  });

  it("a success that lands after the device went offline still counts", async () => {
    fetchMode = "manual";
    serverHealth.noteFailure({
      url: "/api/authenticated/search",
      code: "ERR_NETWORK",
    });
    await advance(PROBE_DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // expo-network says offline, but the probe comes back 200: the server
    // is reachable whatever the link state claims.
    serverHealth.setOnline(false);
    manualRespond?.(200);
    await advance(0);
    expect(state().reachability).toBe("ok");
    expect(state().episode).toBeNull();
    expect(ended).toHaveLength(0);
  });

  it("failures during an open episode are counted, not probed again", async () => {
    fetchMode = "network";
    serverHealth.noteFailure({ url: "/a", code: "ERR_NETWORK" });
    serverHealth.noteFailure({ url: "/b", code: "ERR_NETWORK" });
    serverHealth.noteFailure({ url: "/c", status: 502 });
    await advance(PROBE_DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state().episode?.failedRequests).toBe(3);
    expect(state().episode?.trigger.url).toBe("/a");
  });

  it("reset drops the episode unreported, and a late probe answer is ignored", async () => {
    fetchMode = "hang";
    serverHealth.noteFailure({
      url: "/api/authenticated/search",
      code: "ERR_NETWORK",
    });
    await advance(PROBE_DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    serverHealth.reset();
    expect(state().reachability).toBe("ok");
    expect(state().episode).toBeNull();

    await advance(PROBE_TIMEOUT_MS + RECOVERY_INTERVAL_MS);
    expect(state().reachability).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ended).toHaveLength(0);
  });

  it("does nothing without a configured server", async () => {
    serverHealth.configure({ server: null });
    serverHealth.noteFailure({ url: "/x", status: 502 });
    await advance(PROBE_DEBOUNCE_MS);
    expect(state().reachability).toBe("ok");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("probeIfUnhealthy asks at once when a banner is up, and not otherwise", async () => {
    serverHealth.probeIfUnhealthy();
    await advance(0);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMode = "network";
    serverHealth.noteFailure({ url: "/x", code: "ERR_NETWORK" });
    await advance(PROBE_DEBOUNCE_MS + CONFIRM_INTERVAL_MS);
    expect(state().reachability).toBe("unreachable");
    const sent = fetchMock.mock.calls.length;

    fetchMode = "ok";
    serverHealth.probeIfUnhealthy();
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(sent + 1);
    expect(state().reachability).toBe("ok");
  });

  it("selectHealthNotice returns stable references for the same state", () => {
    useServerHealthStore.setState({ reachability: "unreachable" });
    expect(selectHealthNotice(state())).toBe(selectHealthNotice(state()));
    useServerHealthStore.setState({ isOnline: false });
    expect(selectHealthNotice(state())?.kind).toBe("offline");
  });
});
