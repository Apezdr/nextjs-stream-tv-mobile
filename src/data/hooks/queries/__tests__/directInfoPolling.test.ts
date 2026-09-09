import {
  DIRECT_INFO_MAX_HARD_FAILURES,
  DIRECT_INFO_MIN_RETRY_MS,
  DIRECT_INFO_POLL_MS,
  DirectInfoPendingError,
  directInfoRefetchInterval,
} from "@/src/data/hooks/queries/useDirectPlayInfo";
import { NO_DIRECT_PLAY_INFO } from "@/src/data/types/directPlay.types";

describe("directInfoRefetchInterval", () => {
  it("stops once any verdict exists", () => {
    expect(
      directInfoRefetchInterval({
        data: NO_DIRECT_PLAY_INFO,
        error: null,
        hardFailures: 0,
      }),
    ).toBe(false);
  });

  it("keeps polling on the server's Retry-After while derivation is pending, regardless of failure count", () => {
    const pending = new DirectInfoPendingError(30_000);
    expect(
      directInfoRefetchInterval({
        data: undefined,
        error: pending,
        hardFailures: DIRECT_INFO_MAX_HARD_FAILURES + 5,
      }),
    ).toBe(30_000);
  });

  it("floors a tiny or missing Retry-After", () => {
    expect(new DirectInfoPendingError(0).retryAfterMs).toBe(
      DIRECT_INFO_MIN_RETRY_MS,
    );
    expect(new DirectInfoPendingError(undefined).retryAfterMs).toBe(
      DIRECT_INFO_POLL_MS,
    );
  });

  it("gives up after repeated hard failures, not before", () => {
    const boom = new Error("500");
    expect(
      directInfoRefetchInterval({
        data: undefined,
        error: boom,
        hardFailures: DIRECT_INFO_MAX_HARD_FAILURES - 1,
      }),
    ).toBe(DIRECT_INFO_POLL_MS);
    expect(
      directInfoRefetchInterval({
        data: undefined,
        error: boom,
        hardFailures: DIRECT_INFO_MAX_HARD_FAILURES,
      }),
    ).toBe(false);
  });
});
