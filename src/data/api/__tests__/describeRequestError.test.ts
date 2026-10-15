import { ApiError } from "../axiosClient";
import { describeRequestError } from "../describeRequestError";

import { useServerHealthStore } from "@/src/stores/serverHealthStore";

const healthy = () =>
  useServerHealthStore.setState({ isOnline: true, reachability: "ok" });

beforeEach(healthy);

describe("describeRequestError", () => {
  it("never shows the transport's own message", () => {
    const error = new ApiError(
      503,
      "<html>",
      "Request failed with status code 503",
    );
    expect(describeRequestError(error)).not.toMatch(/status code/);
  });

  it("lets the health store speak first", () => {
    const error = new ApiError(
      503,
      null,
      "Request failed with status code 503",
    );
    useServerHealthStore.setState({ isOnline: false });
    expect(describeRequestError(error)).toBe("No network connection.");

    useServerHealthStore.setState({
      isOnline: true,
      reachability: "unreachable",
    });
    expect(describeRequestError(error)).toBe(
      "Can't reach the server right now.",
    );

    useServerHealthStore.setState({ reachability: "degraded" });
    expect(describeRequestError(error)).toMatch(/database isn't responding/);
  });

  it("maps statuses to plain wording", () => {
    expect(describeRequestError(new ApiError(503, null))).toBe(
      "The server isn't responding right now.",
    );
    expect(describeRequestError(new ApiError(404, null))).toBe(
      "This title isn't available.",
    );
    expect(describeRequestError(new ApiError(403, null))).toBe(
      "You don't have access to this title.",
    );
    expect(describeRequestError(new ApiError(422, null))).toBe(
      "Couldn't load this title.",
    );
  });

  it("treats no-response errors as the server not responding", () => {
    const network = Object.assign(new Error("Network Error"), {
      code: "ERR_NETWORK",
    });
    expect(describeRequestError(network)).toBe(
      "The server isn't responding right now.",
    );
    const timeout = Object.assign(new Error("timeout of 15000ms exceeded"), {
      code: "ECONNABORTED",
    });
    expect(describeRequestError(timeout)).toBe(
      "The server isn't responding right now.",
    );
  });

  it("falls back to the caller's wording for anything else", () => {
    expect(
      describeRequestError(new Error("boom"), "Couldn't load the row."),
    ).toBe("Couldn't load the row.");
    expect(describeRequestError(undefined)).toBe("Couldn't load this title.");
  });
});
