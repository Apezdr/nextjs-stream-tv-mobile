> **Provenance:** Generated 2026-07-14 from a read-only, four-dimension automated audit of the
> `nextjs-stream-tv-mobile` React Native / Expo app. No code was changed. This is a planning
> document for the frontend team, produced as the RN-side counterpart to the backend
> `originalTitle` routing change (which lives in the separate Next.js repo).
>
> **Spot-check before acting:** a few `file:line` references for files the auditors inferred
> rather than opened directly — notably `useWatchlistToggle.ts` and `useActionSheetConfig.ts`
> line numbers — should be verified against the current source before implementation.

---

# RN migration: media identity → originalTitle

_Planning doc — recommendations only, no code changes. Prepared by tech lead from four read-only RN auditor passes. All references are `file:line` in `nextjs-stream-tv-mobile`._

---

## 1. Executive summary

The backend is introducing `originalTitle` as the stable public media key to replace the churning `_id`/`mediaId` that today drives every RN navigation, resolver call, and cache key. Once adopted, RN media requests and client caches key on `originalTitle` instead of an id that changes on every content re-sync, eliminating cache orphaning and stale deep-links. **Hard sequencing constraint: the backend `/api/authenticated/media` resolver (and the screensaver/banner/watchlist endpoints) must ship and deploy first** — RN literally cannot send `originalTitle` today (the `mediaTitle` param is declared but dead; **zero** callers populate it, verified by all four auditors), and if RN sends a title the deployed server doesn't accept, resolves fail or silently ignore it. **Data-migration gap (call out explicitly):** existing client + server rows keyed on the old id will not match new `originalTitle` keys — specifically **tmdb-less watchlist entries** (keyed on `mediaId`, `useWatchlistToggle.ts:70`) and **presence/library linkage** (`mediaMetadata.mediaId`, `usePlaybackPresenceTracking.ts:69`); these need server-side dual-keying/backfill or items duplicate/lose status at cutover. (Nuance below: URL-keyed resume progress is _not_ in this gap.) The safe path is a **staged, feature-flagged rollout that sends `originalTitle` additively while keeping `mediaId` as a fallback**, with React Query cache keys re-keyed in lockstep — never one without the other.

---

## 2. Contract verification

Backend's core safety claims verified against RN source. **Headline: no `link` or `url` parsing exists anywhere — this is NOT a blocker.** All four auditors independently confirmed it.

| # | Backend claim | Verdict | Evidence (file:line) |
|---|---|---|---|
| 1 | RN uses `link` **only** as a truthiness availability signal (`!item.link`), never parses it | ✅ **Confirmed** | Canonical check `item.isAvailable === false \|\| !item.link` at `ContentItem.tsx:114`. Empty-string checks only: `my-list.tsx:47`, `genre/[type]/[name].tsx:38`, `MyListPageContent.tsx:228`. Everywhere else `link: item.link` is a pass-through into a card DTO (`index.tsx:354`, `search.tsx:188/290`, `useShowsPageLogic.ts:106`, `useMoviesPageLogic.ts:107`). Targeted greps for `split/substring/replace/slice/indexOf/startsWith/includes/match` on `link` returned **only** the `.trim().length===0` emptiness checks. `link` is never routed or played. |
| 2 | No `url` availability field parallel to `link` | ✅ **Confirmed (n/a)** | No media type has a `url` field. All `.url` reads are unrelated: backdrop image (`backdropStore.ts:99/192`), subtitle file (`SubtitlePlayer.tsx:34/57`), axios config (`axiosClient.ts:198+`). |
| 3 | `MediaDetailsResponse.link` is a playback source | ✅ **Confirmed dead / n/a** | `MediaDetailsResponse.link` (`content.types.ts:156`) is **never read**. Playback always uses `videoURL`: `mobile watch/[id].tsx:80`, `tv watch/[id].tsx:75`, `TVAppStateContext.tsx:283`. Backend renaming/dropping `link` cannot break playback. |
| 4 | RN navigates by `id`/`mediaId` (not by title) | ✅ **Confirmed** | Chain: `item.id`→`showId` (`index.tsx:349`) → `onSelect(item.showId\|\|item.id)` (`ContentItem.tsx:147`) → `navigateToWatch/navigateToMediaInfo({id})` (`navigationHelper.ts:57/74`) → route `[id]` → `mediaId: params.id` (`tv watch:66`, `mobile watch:71`, `tv media-info:53/61`). Screensaver builds raw `_id` URLs (`Screensaver.tsx:1047/1054/1065`). No caller navigates by title. |
| 5 | RN can carry `originalTitle` via the existing `mediaTitle` param with no new plumbing | ❌ **Violated** | `mediaTitle` is declared (`MediaParams`, `content.types.ts:214`) and forwarded by `buildQueryParams` in all three resolver builders (`contentService.ts:171/204/230`), but grep for `mediaTitle:` finds **zero** callers that set it. Resolution is 100% by `mediaId`. Adopting `originalTitle` **requires new plumbing** (route param → resolver arg), whether reusing `mediaTitle` or adding `mediaOriginalTitle`. |
| 6 | The `mediaTitle \|\| mediaId` identifier logic governs media caching/identity | ❌ **Violated** | That logic lives **only** in dead code: `useContentQueries.ts:129` (`useMediaDetails`) and `:561` (`prefetchMediaDetails`), plus state-based `useContent.ts:190` — **no consumers** (grep-confirmed). The **live** caches key purely on `mediaId`: `useContent.ts:592` `["tvShow", mediaId]` and `:630` `["tvSeason", mediaId, effectiveSeason]`; watch-screen + `TVAppStateContext` fetches use no React Query cache at all. **A migration author editing the `mediaTitle \|\| mediaId` line will believe identity is fixed while the live path is untouched.** |
| 7 | Backend keeps `_id`/`mediaId` authoritative; `originalTitle` becomes the stable key | ⚠️ **Partial** | RN can transition without a URL change (resolver already forwards both params), but nothing yet keys on `originalTitle`, so the stable-key benefit is unrealized until keys + params move. **Open precedence question:** `buildQueryParams` (`endpoints.ts:74`) emits _every_ non-null key, so sending both `mediaId` **and** `originalTitle` leaves the "authoritative" `mediaId` winning — the migration silently no-ops unless backend prefers `originalTitle` when present, or RN stops sending `mediaId`. Must confirm before wiring. |
| 8 | `originalTitle` present on card + detail + watchlist responses | ⚠️ **Unverifiable from RN** | Cannot inspect backend payloads. RN types **lack the field**: `MediaItem` (`content.types.ts:14`), `MediaParams` (`212`), `TVDeviceMediaResponse` (`132`), `MediaDetailsResponse` (`156`), `EpisodeSpecificResponse` (`526`), plus screensaver + banner response types. These type + transform additions are prerequisites. |

**Auditor agreement:** unanimous on claims 1–4 (`link` safe, navigate-by-id). Unanimous that `mediaTitle` is dead (claims 5–6). No auditor disagreements; auditor 2 added the dead-code-trap warning, auditor 4 added the resume-progress nuance below.

---

## 3. What must change, by area

### (a) Types — add `originalTitle` (optional, for safe staged rollout)

| Type | Location | Edit |
|---|---|---|
| `MediaItem` | `content.types.ts:14/15/28` | `originalTitle?: string` — root of every card/list transform |
| `TVDeviceMediaResponse` | `content.types.ts:132` | `originalTitle?: string` |
| `MediaDetailsResponse` | `content.types.ts:156` (~153) | `originalTitle?: string` (its `link` is dead — safe to leave) |
| `EpisodeSpecificResponse` | `content.types.ts:526` | `originalTitle?: string` if episodes resolve canonically |
| `MediaParams` | `content.types.ts:212` | add `mediaOriginalTitle?: string` **or** start populating existing `mediaTitle` (`:214`) |
| `WatchlistWritePayload` | `content.types.ts:497` | `originalTitle?: string` |
| `WatchlistStatusParams` | `content.types.ts:512` | `originalTitle?: string` |
| `PlaybackUpdateRequest.mediaMetadata` | `contentService.ts:77/80` | `mediaOriginalTitle?: string`; make `mediaId` optional once backend resolves by title |
| `NavigationParams` | `navigationHelper.ts:25/26` | `originalTitle?: string` (index signature `:33` already permits it, but type it explicitly) |
| `ContentItemData` (TV card DTO) | `ContentItem.tsx:42` | `originalTitle?: string` |
| `MobileContentCardData` | `MobileContentCard.tsx:26` | `originalTitle?: string` |

### (b) Media API request layer

- **Request builders** — add `originalTitle` to the destructure + `buildQueryParams` object in `getMediaDetails` (`contentService.ts:171`), `getTVMediaDetails` (`:204`), and `getRootShowData` (`:230`). `buildQueryParams` (`endpoints.ts:74`) needs **no change** — it serializes any new key automatically.
- **Precedence:** decide whether to keep sending `mediaId` alongside. Because every non-null key is emitted, dual-sending only works if the backend prefers `originalTitle`. Otherwise `mediaId` wins and nothing migrates (see contract claim 7).
- **Live cache keys (the real fix):** re-key `useContent.ts:592` `["tvShow", mediaId]` → include/replace with `originalTitle`, and `:630` `["tvSeason", mediaId, effectiveSeason]` → `["tvSeason", originalTitle, effectiveSeason]`; same for `useMovieDetails` (`:810`). **This is the only place cache invalidation semantics actually change** — adding `originalTitle` to the URL without re-keying still churns the client cache on every sync.
- **Dead code (low priority, don't be misled):** `useContentQueries.ts:129/561`, `useContent.ts:190`, `queryKeys.ts:43/170`, `postMediaDetails` (`contentService.ts:245`) — all unconsumed. Update only for consistency if revived; if `originalTitle` flows through the existing `mediaTitle` slot the `mediaTitle || mediaid` chain already prefers it.

### (c) Navigation / route identity

**Recommendation (both nav-aware auditors converge here): keep `[id] = id/showId`; thread `originalTitle` as an additional param.** Rationale: no URL churn, avoids encoding free-text titles (spaces/slashes/unicode) into the route segment, and — critically — avoids the `dismissTo` consistency hazard below. `originalTitle` rides only to the API layer, not the URL.

- `NavigationParams` gains `originalTitle` (`navigationHelper.ts:26`); thread it through `navigateToWatch` (`:57`), `navigateToMediaInfo` (`:74`), `navigateToEpisodeInfo` (`:116`).
- Receiving screens read the new param alongside `params.id` and forward it to the resolver: `tv watch/[id].tsx:103` (calls at `:64/:358/:474`), `mobile watch/[id].tsx:108` (`:69/:246/:523`), `tv media-info/[id].tsx:32` (`:51–65`), `mobile media-info/[id].tsx:59` (`:96–110`).
- Emit `originalTitle` at every source: `ContentItem.tsx:146-153` (`onSelect`), browse `index.tsx:340/349` transform + nav calls `:441–519`, `MobileBanner.tsx:219`, and **Screensaver's raw string URLs** `Screensaver.tsx:1047/1054/1065` (these have no clean place for an extra param — needs an explicit `&mediaOriginalTitle=${encodeURIComponent(...)}` and the screensaver response must expose the field).
- **`dismissTo` hazard (highest-risk consistency point):** `tv watch/[id].tsx:677` uses `router.dismissTo({pathname:'/media-info/[id]', params:{id: params.id}})` to return to an existing media-info instance by matching its `[id]` segment. If `[id]` is filled inconsistently mid-migration, `dismissTo` silently **creates a duplicate** screen instead of returning. Keeping `[id]=id` (recommendation) sidesteps this entirely.

> _Rejected alternative:_ putting `encodeURIComponent(originalTitle)` in `[id]`. More "purist" but forces every entry point to change in lockstep, re-introduces the `dismissTo` matching risk, and requires encoding in `Screensaver.tsx`'s raw template strings (which would corrupt unencoded titles). Not worth it.

### (d) Sync / tracking / watchlist writes (the churn paths)

**Precision — do NOT migrate the wrong identifier (unanimous auditor-4 warning):**
- **Resume progress is URL-keyed and churn-IMMUNE.** `PlaybackUpdateRequest.videoId = videoURL` (`usePlaybackPresenceTracking.ts:110`); the server derives `WatchHistory.normalizedVideoId` from it. **Leave this alone** — moving it to `originalTitle` would break working resume.
- **Presence teardown is churn-immune.** `endPlaybackPresence` sends only a client `Crypto.randomUUID` `sessionId` (`usePlaybackPresenceTracking.ts:226/242`, `contentService.ts:391`). No change.

**What actually needs migrating:**
- **Playback metadata identity:** `mediaMetadata.mediaId = videoData.id || params.id` (`usePlaybackPresenceTracking.ts:69`) — add `mediaOriginalTitle` from `videoData.originalTitle`. Used for presence/library linkage, not resume.
- **Duplicated episode-switch inline writes (easy to miss):** `mobile watch/[id].tsx:510` and `tv watch/[id].tsx:461` each re-implement `buildMediaMetadata` with `mediaId: effectiveVideoData.id || params.id`. Must be migrated **in lockstep** with the hook or they emit stale-id-only writes on every episode change. Prefer `response.originalTitle` over the `.id` fallback.
- **Watchlist writes:** `useWatchlistToggle.ts:70` (`mediaId = !resolvedTmdbId ? id : undefined`) and `:102` (`toggleWatchlistItem`); `useActionSheetConfig.ts` toggle/add/remove/status at `:253/:317/:501/:541/:556`. Add `originalTitle` to the payload so **tmdb-less** items key on a stable value. Server precedence: `tmdbId` → `originalTitle` → `mediaId`.
- **Local optimistic cache key:** `useActionSheetConfig.ts:163` builds `mediaId:${contentData.id}:${mediaType}` when no tmdbId; `removeItemFromWatchlistCaches` matches on `item.id` (`:220`). Switch the fallback segment to `originalTitle` or bookmark icons go stale when id churns mid-session.
- **Transforms feeding writes:** `MyListPageContent.tsx:180` (+`unavailableItemIds` Set keyed on `item.id` at `:233`), `my-list.tsx:29`, and `getFlattenedInfiniteWatchlistData` (`useInfiniteContentQueries.ts:347`, passes `MediaItem[]` straight through — `originalTitle` flows automatically once `MediaItem` gains it and the backend emits it).
- **Legacy path (verify dead before skipping):** `TVAppStateContext.tsx:235/268/281` (`selectContentAndWatch`) resolves by `mediaId` and builds `contentId = ${mediaId}-${seasonId}-${episodeId}` (`:295`). Auditor 1 believes it's disconnected from the file-based routes but flags it as a possible silent id-based hold-out. **Confirm it's dead** or migrate it. (Its `episodeId.match(/E(\d+)/)` regex at `:258` parses episode number, not media identity — unrelated to this migration.)

---

## 4. Sequencing / rollout

Ordered so each step is safe against the **backend-not-yet-deployed** state. Nothing here breaks current id-based flows because every addition is optional/additive and gated.

1. **Backend ships & deploys first** (out of scope here, but the gate for everything below): resolver accepts `originalTitle`; card/detail/watchlist/**screensaver**/**banner** responses include it; server dual-keys presence/watchlist and prefers `originalTitle` when present. RN must advertise-check this before sending.
2. **RN types** (§3a) — additive, optional fields. Zero runtime effect. Safe to merge anytime.
3. **Populate `originalTitle` through transforms** — read `item.originalTitle` alongside existing `link: item.link` in every `transformMediaItems` (browse `index.tsx`, `my-list.tsx`, mobile/TV genre + search, `MyListPageContent.tsx`, `useShowsPageLogic.ts`, `useMoviesPageLogic.ts`). Harmless while backend omits the field (stays `undefined`).
4. **Thread `originalTitle` through `NavigationParams`** and read it in the four receiving screens — value is carried but not yet sent to the API. Still inert.
5. **Behind a feature flag gated on a server-advertised capability**, start sending `mediaOriginalTitle`/`mediaTitle` to the resolver from all callers (§3c), **keeping `mediaId` as fallback**. This is the first step that can regress resolution if the flag is wrong — hence gated.
6. **Re-key React Query caches** (`useContent.ts:592/630`, `useMovieDetails`) to `originalTitle` **in the same release** as step 5 — keys and request params must move together, or a straddle (stable requests + id-keyed cache) reintroduces the churn.
7. **Watchlist + playback writes** (§3d) send `originalTitle` additively (dual-key). Do **not** drop `mediaId`/`tmdbId` yet.
8. **Screensaver/banner deep-links** carry `originalTitle` once those responses expose it — or accept they stay on the id path until then.
9. **Only after** backend confirms all rows backfilled/dual-keyed: consider dropping `mediaId` from writes and the fallback. This is a later, separate release.

**Must be feature-flagged / fall back gracefully:** step 5 (resolver param) and step 7 (writes) — gate on server capability; keep `mediaId`/`tmdbId` fallbacks through the entire rollout window. `originalTitle` fields stay optional so any missing-payload case degrades to today's id behavior rather than crashing.

---

## 5. Risks & open questions

- **Data-migration gap (old rows keyed on `_id`) — the headline risk.** tmdb-less watchlist entries (`useWatchlistToggle.ts:70`, `useActionSheetConfig.ts:163/220`) and presence/library linkage (`mediaMetadata.mediaId`) currently key on the old id. New `originalTitle`-keyed rows won't match them → items appear to **duplicate or lose in-list status** at cutover. Requires **server-side dual-keying + backfill** before RN drops `mediaId`. _Refinement of the brief's premise:_ resume-progress rows are **not** in this gap — they're keyed on `normalizedVideoId`/`videoURL` and are churn-immune (auditor 4). The gap is watchlist + presence/library only.
- **Special-char encoding of `originalTitle`.** Free text (spaces, slashes, punctuation, non-ASCII). Safe in query params via `URLSearchParams` (auto-encoded), and safe if kept out of the `[id]` route segment (the recommendation). **But** `Screensaver.tsx:1047/1054/1065` builds URLs as raw template strings — any `originalTitle` placed there **must** be `encodeURIComponent`'d manually or it corrupts.
- **Dead-code trap (auditor 2).** The only `mediaTitle || mediaId` + `queryKeys.media` path (`useContentQueries.ts:129/561`, `useContent.ts:190`) is unused. Editing it feels like fixing identity but the live path (`useContent.ts:592/630` + imperative watch fetches) is untouched.
- **Precedence / silent no-op.** `buildQueryParams` emits every non-null key; sending both `mediaId` and `originalTitle` lets the "authoritative" `mediaId` win. **Open question for backend:** does the resolver prefer `originalTitle` when present? If not, RN must stop sending `mediaId` to migrate — which conflicts with keeping it as a rollout fallback. Needs an explicit precedence contract.
- **`dismissTo` duplication** (`tv watch/[id].tsx:677`): the `[id]` value on the media-info push must exactly equal what watch reconstructs, or back-nav spawns a duplicate. Mitigated by the keep-`[id]`-as-id recommendation.
- **Duplicated write logic** (`mobile watch:510`, `tv watch:461`): copies of `buildMediaMetadata`; migrate all three together or episode-switches emit stale-id-only writes.
- **`showId` inherits id instability** (`index.tsx:349` and mobile transforms `showId: item.id`) — migration must cover `showId`, not just `id`.
- **Fallbacks that re-pivot on `.id`:** `tv watch:461` `effectiveVideoData.id || params.id` and `TVAppStateContext` episode flow — prefer `response.originalTitle` or they re-introduce churn during episode refetch.
- **`originalTitle` uniqueness (open question for backend):** as a React Query cache key it must be unique per resource across movie/tv. Confirm the backend guarantees no collisions before using it alone as a key.
- **Screensaver/banner payload dependency:** `ScreensaverResponse` (`content.types.ts:327`) and the banner item type have no `originalTitle`; those nav paths have nothing to send until the backend extends **those** responses — not just card/detail/watchlist.
- **Availability coupling to `link`:** `isUnavailable`/`!item.link`/`.trim().length===0` derive availability from `link` being non-empty. If the backend empties/renames/drops `link` while introducing `originalTitle`, items silently flip available/unavailable. Keep `link` truthy as the availability flag, or migrate availability fully onto the `isAvailable`/`unavailable` booleans **before** touching `link`.
- **Legacy `TVAppStateContext.selectContentAndWatch`** (`:235–320`): verify dead before skipping, or it's a silent id-based hold-out.
- **Screensaver in-session dedup** (`Screensaver.tsx:420`, `_id` comparison): if `_id` churns mid-rotation, two distinct items could compare equal. Low impact; optionally compare on a stable key.

---

## 6. Out of scope

- **All backend changes** — resolver acceptance of `originalTitle`, precedence rules, and adding `originalTitle` to card/detail/watchlist/screensaver/banner responses live in the separate Next.js repo.
- **Backfilling `originalTitle` onto legacy documents** and server-side dual-keying/backfill of existing presence + watchlist rows — a backend data-migration task and the gating precondition for RN dropping `mediaId` (step 9).
- **Reviving dead RN code** (`useMediaDetails`, `prefetchMediaDetails`, `postMediaDetails`, state-based `useContent.ts:190`) — no consumers; not part of this migration.
- **Changing resume-progress / presence-session keying** — correctly URL-/UUID-keyed today and unaffected by id churn; explicitly not to be touched.
