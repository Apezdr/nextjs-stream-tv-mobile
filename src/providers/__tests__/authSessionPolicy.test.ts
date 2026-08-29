import {
  classifySessionBody,
  classifySessionStatus,
} from "@/src/providers/authSessionPolicy";

// These rules are load-bearing for forced sign-out and are not guessable from
// the HTTP status alone — both were verified against the installed
// better-auth 1.6.27 source rather than its documentation.
describe("classifySessionStatus", () => {
  it("treats 2xx as valid", () => {
    expect(classifySessionStatus(200)).toBe("valid");
    expect(classifySessionStatus(204)).toBe("valid");
  });

  it("treats 401 as a sign-out", () => {
    expect(classifySessionStatus(401)).toBe("sign-out");
  });

  // better-auth uses 403 for SESSION_NOT_FRESH (a live session that is merely
  // old), for permission denials, and for the CSRF origin check. None of those
  // mean the session is gone, and signing out on them evicts a valid user.
  it("does NOT treat 403 as a sign-out", () => {
    expect(classifySessionStatus(403)).not.toBe("sign-out");
    expect(classifySessionStatus(403)).toBe("unknown-error");
  });

  it("treats 5xx as a server issue rather than a sign-out", () => {
    expect(classifySessionStatus(500)).toBe("server-issue");
    expect(classifySessionStatus(503)).toBe("server-issue");
  });

  it("treats other 4xx as unknown", () => {
    expect(classifySessionStatus(404)).toBe("unknown-error");
    expect(classifySessionStatus(429)).toBe("unknown-error");
  });
});

describe("classifySessionBody", () => {
  // The authoritative revocation answer: HTTP 200, body is literally `null`.
  it("signs out on a 2xx whose body is a bare null", () => {
    expect(classifySessionBody(200, "null")).toBe("sign-out");
    expect(classifySessionBody(200, "  null  ")).toBe("sign-out");
  });

  it("signs out on a 2xx whose JSON body carries no user", () => {
    expect(classifySessionBody(200, "{}")).toBe("sign-out");
    expect(classifySessionBody(200, '{"session":null,"user":null}')).toBe(
      "sign-out",
    );
  });

  it("is valid when a 2xx body carries a user", () => {
    expect(classifySessionBody(200, '{"user":{"id":"1"}}')).toBe("valid");
  });

  // The distinction this function exists for. A proxy or captive portal
  // substituting an HTML page with a 200 must NOT log anyone out — and it is
  // indistinguishable from a real answer once you've gone through .json().
  it("never signs out on a 2xx body that is not JSON", () => {
    expect(classifySessionBody(200, "<html>502 Bad Gateway</html>")).toBe(
      "unknown-error",
    );
    expect(classifySessionBody(200, "Service Unavailable")).toBe(
      "unknown-error",
    );
  });

  it("never signs out on an empty 2xx body", () => {
    expect(classifySessionBody(200, "")).toBe("unknown-error");
    expect(classifySessionBody(200, "   ")).toBe("unknown-error");
    expect(classifySessionBody(200, null)).toBe("unknown-error");
    expect(classifySessionBody(200, undefined)).toBe("unknown-error");
  });

  it("defers to the status for non-2xx regardless of body", () => {
    expect(classifySessionBody(401, "anything")).toBe("sign-out");
    expect(classifySessionBody(503, "<html>down</html>")).toBe("server-issue");
    expect(classifySessionBody(403, "null")).toBe("unknown-error");
  });
});
