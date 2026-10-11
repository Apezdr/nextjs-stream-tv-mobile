import { shouldRetryQuery } from "../queryState";

import { useServerHealthStore } from "@/src/stores/serverHealthStore";

const healthy = () =>
  useServerHealthStore.setState({ isOnline: true, reachability: "ok" });

beforeEach(healthy);

describe("shouldRetryQuery", () => {
  it("retries network and 5xx failures up to the limit while the server looks fine", () => {
    expect(shouldRetryQuery(1, { status: 502 }, 3)).toBe(true);
    expect(shouldRetryQuery(2, new Error("Network Error"), 3)).toBe(true);
    expect(shouldRetryQuery(3, { status: 502 }, 3)).toBe(false);
  });

  it("never retries a 4xx", () => {
    expect(shouldRetryQuery(1, { status: 404 }, 6)).toBe(false);
    expect(shouldRetryQuery(1, { status: 401 }, 6)).toBe(false);
  });

  it("stops as soon as the health store knows the server is down", () => {
    useServerHealthStore.setState({ reachability: "unreachable" });
    expect(shouldRetryQuery(1, { status: 503 }, 6)).toBe(false);

    useServerHealthStore.setState({ reachability: "degraded" });
    expect(shouldRetryQuery(1, { status: 503 }, 6)).toBe(false);

    useServerHealthStore.setState({ reachability: "ok", isOnline: false });
    expect(shouldRetryQuery(1, new Error("Network Error"), 6)).toBe(false);
  });

  it("keeps retrying while the server is only a suspect", () => {
    useServerHealthStore.setState({ reachability: "suspect" });
    expect(shouldRetryQuery(1, { status: 503 }, 3)).toBe(true);
  });
});
