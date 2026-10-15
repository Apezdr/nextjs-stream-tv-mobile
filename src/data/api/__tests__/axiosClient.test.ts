jest.mock("../../../stores/serverHealthStore", () => ({
  serverHealth: { noteFailure: jest.fn(), noteSuccess: jest.fn() },
}));

import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

import { serverHealth } from "../../../stores/serverHealthStore";
import {
  ApiError,
  createAxiosClient,
  DEFAULT_TIMEOUT_MS,
} from "../axiosClient";

type Config = InternalAxiosRequestConfig;
type Adapter = (config: Config) => Promise<unknown>;

const health = serverHealth as unknown as {
  noteFailure: jest.Mock;
  noteSuccess: jest.Mock;
};

function clientWith(adapter: Adapter) {
  const client = createAxiosClient("https://example.test");
  client.defaults.adapter = adapter as never;
  return client;
}

const ok = (config: Config, headers: Record<string, string> = {}) =>
  Promise.resolve({ data: {}, status: 200, statusText: "OK", headers, config });

const httpError = (
  config: Config,
  status: number,
  headers: Record<string, string> = {},
) =>
  Promise.reject(
    new AxiosError(
      `HTTP ${status}`,
      "ERR_BAD_RESPONSE",
      config,
      {},
      {
        data: {},
        status,
        statusText: "",
        headers,
        config,
      },
    ),
  );

const networkError = (config: Config) =>
  Promise.reject(new AxiosError("Network Error", "ERR_NETWORK", config, {}));

/** Drive a promise to settlement under fake timers. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  promise.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  while (!done) await jest.advanceTimersByTimeAsync(100);
  return promise;
}

beforeEach(() => {
  jest.useFakeTimers();
  health.noteFailure.mockClear();
  health.noteSuccess.mockClear();
});

afterEach(() => jest.useRealTimers());

describe("axios client transport policy", () => {
  it("times out at 15 s and makes no transport retries by default", async () => {
    const adapter = jest.fn((config: Config) => httpError(config, 502));
    const client = clientWith(adapter);
    expect(client.defaults.timeout).toBe(DEFAULT_TIMEOUT_MS);

    await expect(settle(client.get("/api/x"))).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
    });
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("`retries` opts a request into retries with exponential backoff", async () => {
    let calls = 0;
    const adapter = jest.fn((config: Config) =>
      ++calls < 3 ? networkError(config) : ok(config),
    );
    const client = clientWith(adapter);

    const request = client.post("/api/sync", {}, { retries: 2 });
    await jest.advanceTimersByTimeAsync(0);
    expect(adapter).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(adapter).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(2000);
    expect(adapter).toHaveBeenCalledTimes(3);
    await expect(request).resolves.toMatchObject({ status: 200 });
  });

  it("has no circuit breaker: requests keep going out after any number of 5xx", async () => {
    const adapter = jest.fn((config: Config) => httpError(config, 502));
    const client = clientWith(adapter);
    for (let i = 0; i < 10; i++) {
      const error = await settle(client.get("/api/list")).catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(502);
    }
    expect(adapter).toHaveBeenCalledTimes(10);
  });
});

describe("axios client and server health", () => {
  it("reports a 5xx with its status and whether Cloudflare answered", async () => {
    const client = clientWith((config) =>
      httpError(config, 502, { "cf-ray": "abc" }),
    );
    await settle(client.get("/api/list")).catch(() => {});
    expect(health.noteFailure).toHaveBeenCalledTimes(1);
    expect(health.noteFailure).toHaveBeenCalledWith({
      url: "/api/list",
      status: 502,
      code: "ERR_BAD_RESPONSE",
      viaCloudflare: true,
    });
    expect(health.noteSuccess).not.toHaveBeenCalled();
  });

  it("reports a network error with its code and no status", async () => {
    const client = clientWith(networkError);
    await settle(client.get("/api/list")).catch(() => {});
    expect(health.noteFailure).toHaveBeenCalledWith({
      url: "/api/list",
      code: "ERR_NETWORK",
    });
  });

  it("does not report a 4xx, an expected status, or a cancellation", async () => {
    await settle(clientWith((c) => httpError(c, 404)).get("/api/x")).catch(
      () => {},
    );
    await settle(
      clientWith((c) => httpError(c, 504)).get("/api/direct-info", {
        expectedStatuses: [504],
      }),
    ).catch(() => {});
    await settle(
      clientWith((c) =>
        Promise.reject(new axios.CanceledError("canceled", undefined, c)),
      ).get("/api/x"),
    ).catch(() => {});
    expect(health.noteFailure).not.toHaveBeenCalled();
    expect(health.noteSuccess).not.toHaveBeenCalled();
  });

  it("reports every successful response", async () => {
    const client = clientWith((c) => ok(c));
    await settle(client.get("/api/list"));
    await settle(client.post("/api/sync", {}));
    expect(health.noteSuccess).toHaveBeenCalledTimes(2);
    expect(health.noteFailure).not.toHaveBeenCalled();
  });
});
