# Client Error Reporting — API Contract Proposal

Contract for the TV/mobile app to report client-side errors to the media
server it is connected to. Designed so the server admin (who owns the
transcoder sidecar) sees failures for **their** users on **their** server,
and can correlate reports with transcoder access logs.

Status: **server implemented** (nextjs-stream branch `feat/client-error-reporting`,
2026-07-23) — the endpoint, storage, admin UI, and fatal-report admin
notifications below are built and verified against the code (validation is
covered by unit tests, including this doc's example payload). Client side is
**implemented**: envelope types in `src/data/types/clientError.types.ts`,
sender in `src/data/services/errorReportingService.ts` (session dedupe, 429
cooldown, no retries), playback wiring in `src/utils/videoDiagnostics.ts` +
`src/data/hooks/useVideoErrorHandling.ts`.

## Endpoint

```
POST /api/authenticated/client-error
Content-Type: application/json
```

- Authenticated like all `/api/authenticated/*` routes — web cookie session
  or `Authorization: Bearer <access_token>`; the server derives the user
  from the session, the payload never carries user identity.
  - No/invalid session → `401`
    `{"success":false,"error":"Unauthorized","message":"You must be signed in.","code":"AUTH_REQUIRED"}`
  - Unapproved account → `403` (same shape, `"code":"APPROVAL_PENDING"`)
- Response: `204 No Content` (204 only — 202 is not used). The client treats
  this as fire-and-forget: no retries beyond one, never blocks UI, errors
  sending the report are swallowed.
- Rate limit (implemented): **30 reports/user/hour**, sliding window.
  Exceeded → `429` `{"error":"Too many error reports. Please try again later."}`
  with `X-RateLimit-Remaining`, `X-RateLimit-Reset` (unix seconds) and
  `Retry-After` (seconds) headers. Do not retry a 429.
- Payload cap: **100 KB** → `413` `{"error":"Report payload too large"}`.
- Every client fault is a 4xx (`400`/`401`/`403`/`413`/`429`), never a 5xx —
  bad payloads cannot trip the app's 5xx retry/circuit-breaker logic. `500`
  means a genuine server failure.
- Malformed JSON → `400` `{"error":"Invalid JSON body"}`; every validation
  failure → `400` with a specific `{"error":"..."}` message (see table below).

## Envelope (all error categories)

```ts
interface ClientErrorReport {
  schemaVersion: 1;

  /** What subsystem the error came from. Extensible. */
  category: "playback" | "network" | "auth" | "crash" | "other";

  severity: "fatal" | "error" | "warning";

  /**
   * Raw, unmodified error message from the underlying platform.
   * For playback on Android this is ExoPlayer's PlaybackException text,
   * which names the failing format and decoder — never truncate or
   * prettify it client-side.
   */
  message: string;

  /**
   * Client-computed stable key for dedupe, e.g.
   * `${category}:${hash(message + primary context field)}`.
   * The client sends each dedupeKey at most once per app session;
   * the server can additionally use it to group repeats across users.
   */
  dedupeKey: string;

  /** Client clock, ISO 8601. Server stamps its own receivedAt on insert. */
  occurredAt: string;

  app: {
    /** Native app version (expo-constants). */
    version: string;
    /** EAS OTA update id, if running an OTA bundle. */
    otaUpdateId: string | null;
    platform: "android" | "ios" | "web";
    isTV: boolean;
  };

  device: {
    /** e.g. "BRAVIA 4K VH2", "SHIELD Android TV", "iPhone14,2" */
    model?: string;
    brand?: string;
    manufacturer?: string;
    /** Android release ("10") or iOS version ("17.5"). */
    osVersion?: string;
    /** Android API level, when applicable. */
    apiLevel?: number;
  };

  /** Category-specific detail. Shape depends on `category`. */
  details: PlaybackErrorDetails | Record<string, unknown>;
}
```

## Server-side validation (implemented)

| Field | Rule |
|---|---|
| `schemaVersion` | Must be the number `1` exactly (`"1"` is rejected) |
| `category` | Non-empty string, ≤ 50 chars. **Not** restricted to the known set — extensible as designed |
| `severity` | Exactly `"fatal"`, `"error"`, or `"warning"` |
| `message` | Non-empty string. Stored raw/un-normalized; silently truncated at 32,000 chars with a stored `messageTruncated` flag (accepted, never rejected) |
| `dedupeKey` | Non-empty string, ≤ 256 chars |
| `occurredAt` | Non-empty string. Stored raw; also parsed server-side (`null` if unparseable — accepted, never rejected; the server's own `receivedAt` is authoritative) |
| `app` | Required object. `version` non-empty string ≤ 100; `platform` non-empty string ≤ 50 (not enum-checked); `otaUpdateId` optional (non-strings → `null`); `isTV` strict-coerced (`=== true`) |
| `device` | Optional; must be an object if present. `model`/`brand`/`manufacturer` strings ≤ 256, `osVersion` ≤ 50, `apiLevel` number (anything else → `null`) |
| `details` | Optional; must be an object (not an array) if present. **Stored verbatim** — no normalization |

Unknown top-level keys are dropped on insert.

## `category: "playback"` details

Matches `PlaybackErrorReport` in `src/utils/videoDiagnostics.ts`:

```ts
interface PlaybackErrorDetails {
  /** The stream URL in use when the error fired (master.m3u8 URL). */
  videoURL: string | null;

  /** expo-video player status at error time ("error", "loading", ...). */
  playerStatus: string | null;

  /**
   * Playback session UUID — the same id sent in
   * /api/authenticated/sync/updatePlayback heartbeats. THE correlation
   * key: lets the server join this report against playback/presence
   * records and the transcoder's access log (which variant /v/N/ the
   * device fetched last before erroring).
   */
  playbackSessionId: string | null;

  /** What was being played, when known. */
  mediaId: string | null;
  mediaType: string | null;

  /**
   * Decoder capability probe (Android only; empty array elsewhere).
   * Answers "what CAN this device decode" next to "what did it fail
   * on". Cannot distinguish HEVC Main from Main10 — profile-level
   * detail only appears in the raw `message`.
   */
  codecSupport: {
    mimeType: string; // "video/hevc", "video/avc", "video/dolby-vision", ...
    width: number;
    height: number;
    support: "hardware" | "software" | "unsupported" | "unknown";
  }[];
}
```

## Example payload (illustrative Bravia HEVC/DV failure)

```json
{
  "schemaVersion": 1,
  "category": "playback",
  "severity": "fatal",
  "message": "MediaCodecVideoRenderer error, index=0, format=Format(5, null, video/dolby-vision, codecs=dvh1.08.06, 24618803, [3836, 2072, 23.976], ...), format_supported=NO_UNSUPPORTED_TYPE",
  "dedupeKey": "playback:8f3a2c91",
  "occurredAt": "2026-07-23T21:04:11.302Z",
  "app": { "version": "1.4.2", "otaUpdateId": "a1b2c3", "platform": "android", "isTV": true },
  "device": { "model": "BRAVIA 4K VH2", "brand": "Sony", "manufacturer": "Sony", "osVersion": "10", "apiLevel": 29 },
  "details": {
    "videoURL": "https://transcoder.example.com/stream/<id>/master.m3u8",
    "playerStatus": "error",
    "playbackSessionId": "6a1f6f0e-2b0c-4e0a-9a7e-1c2d3e4f5a6b",
    "mediaId": "backrooms-2026",
    "mediaType": "movie",
    "codecSupport": [
      { "mimeType": "video/avc", "width": 1920, "height": 1080, "support": "hardware" },
      { "mimeType": "video/avc", "width": 3840, "height": 2160, "support": "hardware" },
      { "mimeType": "video/hevc", "width": 1920, "height": 1080, "support": "hardware" },
      { "mimeType": "video/hevc", "width": 3840, "height": 2160, "support": "hardware" },
      { "mimeType": "video/x-vnd.on2.vp9", "width": 3840, "height": 2160, "support": "hardware" },
      { "mimeType": "video/av01", "width": 3840, "height": 2160, "support": "unsupported" },
      { "mimeType": "video/dolby-vision", "width": 3840, "height": 2160, "support": "hardware" }
    ]
  }
}
```

Note the diagnosis reads directly off this pair: the probe says the device
*claims* hardware Dolby Vision support, while `message` shows the decoder
rejected the actual DV profile — i.e. capability advertisement and decoder
reality disagree, which is exactly the class of device bug this exists to
catch.

## Server-side implementation (what actually exists)

1. **Raw storage** — append-only `ClientErrorReports` collection (Media db).
   The server stamps its own `receivedAt` and snapshots the session user's
   id + email on insert; `message` and `details` are stored verbatim. The
   collection and its indexes self-create on the first report — no operator
   setup on any deployment.
2. **Retention** — TTL index deletes reports **60 days** after `receivedAt`.
3. **Admin UI** — `/admin/client-errors` (admin nav → "Client Errors").
   Groups by `dedupeKey` ("12 reports · 3 users · BRAVIA 4K VH2"), severity
   tabs + category filter, expandable raw reports (device/app info, playback
   details, codec-support probe, raw message), group delete. Auto-refreshes
   every 15s.
4. **Fatal alerting** — `severity: "fatal"` raises an admin-only
   notification (existing notification system, deep link to the admin page),
   collapsed per `dedupeKey` while unread and throttled server-side to
   5/hour per reporting user and 1/hour per dedupeKey, so a crash-looping
   device cannot flood admins. The client does not need to throttle fatal
   reports beyond its own dedupeKey-once-per-session rule.
5. **Correlation** (admin workflow, unchanged from the proposal) — join
   playback reports via `details.playbackSessionId` against
   playback/presence records (note: presence docs expire ~10 min after the
   last heartbeat, so correlate promptly or fall back to user+time against
   transcoder access logs).
