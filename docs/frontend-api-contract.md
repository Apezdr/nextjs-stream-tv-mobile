# Frontend API Contract

> **Client:** `nextjs-stream-tv-mobile` (React Native / Expo — mobile + TV)  
> **Purpose:** Document exactly what this app **sends** and **consumes** so backend authors and other clients can preserve compatibility.  
> **Sources of truth in this repo:**
>
> - `src/data/api/endpoints.ts`
> - `src/data/types/content.types.ts`, `auth.types.ts`
> - `src/stores/serverHealthStore.ts` (the §14 probe)
> - `src/data/services/contentService.ts`
> - `src/data/hooks/queries/*`, `src/data/hooks/useContent.ts`
> - UI consumers under `src/app/` and `src/components/`
>
> Related: [`auto-captions-client-architecture.md`](./auto-captions-client-architecture.md) for subtitle/auto-caption flows.

---

## Table of contents

1. [Global conventions](#1-global-conventions)
2. [Shared types](#2-shared-types)
3. [Cross-cutting flags](#3-cross-cutting-flags)
4. [Authentication](#4-authentication)
5. [Browse lists — horizontal-list](#5-browse-lists--horizontal-list)
6. [Genres](#6-genres)
7. [Media detail](#7-media-detail)
8. [Banner](#8-banner)
9. [Screensaver](#9-screensaver)
10. [Watchlist](#10-watchlist)
11. [Search](#11-search)
12. [Playback & presence](#12-playback--presence)
13. [Player support assets](#13-player-support-assets)
14. [Server health probe](#14-server-health-probe)
15. [Counts & calendar](#15-counts--calendar)
16. [Endpoint inventory](#16-endpoint-inventory)
17. [Known client quirks](#17-known-client-quirks)
18. [Field usage matrix (MediaItem)](#18-field-usage-matrix-mediaitem)

---

## 1. Global conventions

### Base URL

Set at runtime via `enhancedApiClient.setBaseUrl(serverUrl)` after the user picks a server. All paths below are relative to that origin.

### Auth header

```
Authorization: Bearer <access_token>
```

Applied by the Axios request interceptor for every authenticated call. Some system checks use `skipAuth` (no Authorization header).

### Content type

```
Content-Type: application/json
```

### Query string builder

`buildQueryParams()`:

- Omits keys whose value is `undefined` or `null`
- Coerces other values with `.toString()` (booleans become `"true"` / `"false"`)
- Returns `""` or `?<query>`

### Errors

Client expects JSON error bodies with either:

```json
{ "message": "..." }
```

or

```json
{ "error": "..." }
```

| Status | Client behavior |
|---|---|
| `401` | Attempt token refresh via AuthProvider callback, then retry once |
| `5xx` / network | Retry up to 3 times with exponential backoff; may trigger debounced server-status check |
| Circuit breaker | After 5 consecutive 5xx failures on an endpoint, open for 60s |

### Timeouts

- Default request timeout: **30s**
- Server-status probe timeout: **5s**

### Auth-related fetch (device flow)

Better Auth client uses:

- `credentials: "omit"` (Bearer tokens, not cookies)
- Explicit `Origin: <server-origin>` header (RN fetch does not send Origin; better-auth CSRF requires it)

### Caching and revalidation (ETags)

Since the 27 September 2026 server release, these GETs return a **weak** ETag
(`ETag: W/"<md5 of body>"`) with `Cache-Control: no-cache`:

| Endpoint | Notes |
| --- | --- |
| `/banner` | ETag changes only when the banner list changes |
| `/horizontal-list` | With `includeWatchHistory=true` the ETag changes whenever progress changes |
| `/notifications`, `HEAD /notifications?count=true` | Not called by the app yet |
| `/sync/pullPlayback` | Not called by the app yet |
| `/watchlist?action=status` | Rate-limited: `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` on 429 |
| `/api/status` | `Cache-Control: no-store` from server commit `0fe6d6a` (2026-10-10; live once the production image is rebuilt). Before that it sent no `Cache-Control` at all; the client defeats OS caches itself either way (§14) |

Everything else is `no-store, private` (including `/media` and
`/media/direct-info`, whose playback URLs rotate). `/screensaver` is never cached.

The app does **not** handle ETags itself. The OS HTTP cache does (NSURLCache on
iOS/tvOS, OkHttp's 10 MB disk cache on Android): it stores `no-cache` responses
and sends `If-None-Match` on the next request, and the server answers 304 when
the body is unchanged. To keep that working:

- Never add `Cache-Control` or `Pragma` request headers, `cache: "no-store"`,
  or cache-busting parameters to the ETag endpoints above. The only request-side
  `Cache-Control: no-cache` in the app goes to `/media` and
  `/media/direct-info`, which are `no-store` routes anyway.
- Build query strings the same way every time (`buildQueryParams`, fixed key
  order). Each distinct URL has its own ETag.
- Weak vs strong makes no difference to the app: the OS sends the value back
  verbatim, and the server also tolerates the `-gzip`/`-br`/`-zstd` suffixes
  proxies append.

---

## 2. Shared types

### 2.1 `WatchHistory`

Returned on list items, media detail, and episodes when `includeWatchHistory=true` (or when the server always includes it).

```ts
interface WatchHistory {
  playbackTime: number;      // seconds from start
  lastWatched: string;       // ISO-8601 datetime
  isWatched: boolean;        // true for ANY stored row — "has history", not "finished"
  completed?: boolean;       // server-computed at join time from the catalog duration
  progressPercent?: number;  // 0–100, same source
  normalizedVideoId: string | null;
  mediaId?: string | null;   // the server's resolved catalog id
}
```

**How the client uses it** (see `src/utils/watchProgress.ts`)

| Field | Usage |
|---|---|
| `playbackTime` | Resume seek: `Math.max(0, playbackTime - 2)`. Progress bars: `playbackTime / (duration / 1000)` when `progressPercent` is absent. |
| `completed` / `progressPercent` | Bars, the carousel check badge and the Watched / Continue Watching labels read these first; without them the client falls back to a local 95% rule. |
| `isWatched` | No longer drives any badge (it is true for every row). |
| `lastWatched` | Mobile focus refresh: a row newer than this session's last write is another device's progress and is applied in both directions. |
| `normalizedVideoId` | Typed; identity / sync |

**Critical:** If `playbackTime > 0`, watch screens seek before showing controls. Omitting `watchHistory` is fine (start from 0).

---

### 2.2 `MediaItem` (list / card payload)

Core unit of every paginated list (`horizontal-list`, genres content, watchlist content, search results).

```ts
interface MediaItem {
  id: string;
  tmdbId?: number;
  title: string;
  type: "movie" | "tv";

  // Poster / thumbnail (dual keys — see below)
  posterURL?: string;
  posterBlurhash?: string;       // base64 PNG payload (often without data: prefix)
  thumbnail?: string;
  thumbnailUrl?: string;
  thumbnailBlurhash?: string;

  // Backdrop (dual keys)
  backdrop?: string;
  backdropUrl?: string;
  backdropBlurhash?: string;

  lastWatchedDate: string;
  link: string;                  // media path / availability signal
  hdr?: string;                  // e.g. "HDR10", "10-bit SDR (BT.709)"
  logo?: string;
  releaseDate?: string;

  isAvailable?: boolean;
  isComingSoon?: boolean;
  comingSoonDate?: string | null;
  available?: boolean;           // legacy alias
  unavailable?: boolean;         // legacy alias

  metadata?: {
    tmdbId?: number;
    tmdb_id?: number;
    release_date?: string;
    first_air_date?: string;
    overview?: string;
    genres?: Array<{ id: number; name: string }>;
    [key: string]: unknown;
  };

  episodeNumber?: number;        // recently watched TV
  seasonNumber?: number;
  isTrailer?: boolean;
  watchHistory?: WatchHistory;
}
```

#### Dual image keys (required compatibility)

Every list mapper does fallbacks like:

```ts
thumbnailUrl: item.thumbnailUrl || item.posterURL
backdropUrl:  item.backdropUrl  || item.backdrop
```

**Backend should populate at least one of each pair.** Safest: populate both.

| Purpose | Preferred | Legacy fallback |
|---|---|---|
| Card image | `thumbnailUrl` | `posterURL` |
| Card blurhash | `thumbnailBlurhash` | `posterBlurhash` |
| Backdrop | `backdropUrl` | `backdrop` |
| Backdrop blurhash | `backdropBlurhash` | — |

Blurhashes are rendered as:

```
data:image/png;base64,${blurhash}
```

Send **raw base64** (no `data:` prefix). Some type comments mention a full data-URI; UI code usually prefixes itself.

#### Availability

UI treats an item as unavailable when:

```ts
item.isAvailable === false || !item.link
```

Also surfaces `isComingSoon` / `comingSoonDate` and `isTrailer` badges.

#### Search ID normalization

Search may return Mongo `_id` instead of `id`. Client normalizes:

```ts
id: rest.id ?? _id ?? ""
```

Prefer always returning `id`.

---

### 2.3 Paginated list envelope

Used by `horizontal-list`, genres `action=content`, and watchlist `action=content`:

```ts
interface ContentListResponse {
  currentItems: MediaItem[];
  previousItem: MediaItem | null;
  nextItem: MediaItem | null;
}
```

| Field | Client usage |
|---|---|
| `currentItems` | Flattened into rows / grids |
| `previousItem` | Typed; **not used** for UI pagination |
| `nextItem` | **Primary end-of-list signal** |

**Pagination algorithm (0-based pages):**

```
hasNextPage =
  currentItems.length >= limit
  AND nextItem !== null

nextPageParam = allPages.length   // 0, 1, 2, ...
```

Watchlist additionally reads `pagination.hasNextPage` when present (preferred over `nextItem` for that endpoint).

**Contract implication:** On the last page, set `nextItem` to `null` (even if you still return a full page of items). Do not rely only on short pages.

---

## 3. Cross-cutting flags

### 3.1 `isTVdevice`

Boolean query/body flag. This RN/TV app **does send it** on many routes.

When `true`, the client expects:

| Endpoint | Expected effect |
|---|---|
| `/media` | Enhanced `TVDeviceMediaResponse` (seasons, episodes[], navigation, blurhashes, cast, etc.) |
| `/banner` | Include `clipVideoURL` for TV banner video clips |
| Lists / genres | TV-oriented payload optimizations (whatever the server attaches) |

**Who sends what**

| Path | Typical value |
|---|---|
| `useInfiniteContentList` (home, TV browse) | **Hardcoded `true`** on the wire |
| TV genre / movies / shows pages | `true` |
| Mobile genre / movies / shows / my-list | often `false` |
| Banner | always `true` |
| Search body | `true` or `false` depending on surface |

### 3.2 `includeWatchHistory`

When `true`, attach `watchHistory` on list items / media / episodes.

| Path | Sent? |
|---|---|
| Genres content | Yes (`true` by default in service) |
| Media detail / watch | Yes (`true`) |
| Watchlist content | Yes (`true` by default) |
| Mobile movies/shows custom infinite queries | Yes (`true`) |
| `useInfiniteContentList` | **Callers pass it, but the hook does NOT put it on the query string** (see [quirks](#17-known-client-quirks)) |
| `contentService.getContentList` / `useContentList` | **Not sent** |

Backend should still support the flag for all list endpoints; some code paths do send it.

---

## 4. Authentication

Better-auth **device authorization** flow.

### 4.1 `POST /api/auth/device/code`

**Request:** better-auth device plugin body (no custom app fields).

**Response (`DeviceCodeResponse`):**

```ts
{
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;  // preferred for QR codes
  expires_in: number;                 // seconds
  interval: number;                   // poll interval seconds; server min 5s
}
```

### 4.2 `POST /api/auth/device/token`

Poll until authorized.

**Success (`DeviceTokenSuccess`):**

```ts
{
  access_token: string;
  token_type: "bearer";
  expires_in: number;
}
```

**Pending / error (`DeviceTokenError`):**

```ts
{
  error:
    | "authorization_pending"
    | "slow_down"
    | "access_denied"
    | "expired_token";
}
```

### 4.3 `GET /api/auth/get-session`

**Headers:** `Authorization: Bearer <token>`

**Response (`GetSessionResponse`):**

```ts
{
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
    approved: boolean;
    limitedAccess?: boolean;
    role?: "user" | "admin";
    admin?: boolean;          // derived client-side from role === "admin" if needed
  };
}
```

**Client usage:** `approved === false` → pending-approval screen. `role` / `admin` for admin UI gates.

### 4.4 `POST /api/auth/sign-out`

**Headers:** `Authorization: Bearer <token>`  
Invalidates session server-side. Client clears local token regardless of response.

---

## 5. Browse lists — horizontal-list

### `GET /api/authenticated/horizontal-list`

Primary home / browse carousels and “all movies/shows” grids.

#### Request query

| Param | Type | Default (service) | Values |
|---|---|---|---|
| `type` | string | `"all"` | `movie` \| `tv` \| `recentlyWatched` \| `recentlyAdded` \| `recommendations` \| `all` |
| `sort` | string | `"id"` | `id` \| `title` \| `date` |
| `sortOrder` | string | `"desc"` | `asc` \| `desc` |
| `page` | number | `0` | 0-based |
| `limit` | number | `30` | Home rows often use **20** |
| `includeWatchHistory` | boolean | — | Optional; see flags |
| `isTVdevice` | boolean | — | Optional; infinite list hardcodes `true` |

**Example**

```
GET /api/authenticated/horizontal-list?type=recentlyWatched&sort=id&sortOrder=desc&page=0&limit=20&isTVdevice=true
```

#### Response

```ts
{
  currentItems: MediaItem[];
  previousItem: MediaItem | null;
  nextItem: MediaItem | null;
}
```

#### Fields consumed from each item

`id`, `title`, `type`, `posterURL` / `thumbnailUrl`, blurhashes, `backdrop` / `backdropUrl`, `link`, `hdr`, `logo`, `seasonNumber`, `episodeNumber`, availability flags, `isTrailer`, `watchHistory` (when present), `tmdbId` (watchlist).

#### Call sites (representative)

| Surface | type | limit | isTVdevice on wire |
|---|---|---|---|
| Mobile home rows | recentlyWatched / recentlyAdded / movie / tv | 20 | `true` (via infinite hook) |
| TV home / movies / shows | same | ~30 | `true` |
| Mobile movies/shows tabs | movie / tv | varies | often built with `isTVdevice=false` + `includeWatchHistory=true` |

---

## 6. Genres

### 6.1 List genres

### `GET /api/authenticated/genres?action=list`

#### Request

| Param | Default | Values |
|---|---|---|
| `action` | `"list"` | `list` |
| `type` | `"movie"` | `all` \| `movie` \| `tv` |
| `includeCounts` | `true` | boolean |
| `isTVdevice` | `true` | boolean |

#### Response (`GenresListResponse`)

```ts
{
  availableGenres: Array<{
    id: number;
    name: string;
    movieCount?: number;
    tvShowCount?: number;
    totalCount?: number;
  }>;
  totalGenres: number;
  mediaTypeCounts: {
    movies: number;
    tvShows: number;
    total: number;
  };
  filters: {
    type: "all" | "movie" | "tv";
    includeCounts: boolean;
  };
}
```

**UI usage:** genre grids/cards; counts for labels; preview posters fetched separately via content action.

---

### 6.2 Genre content

### `GET /api/authenticated/genres?action=content`

#### Request

| Param | Default | Notes |
|---|---|---|
| `action` | `"content"` | required |
| `genre` | — | Genre name; comma-separated for multiple |
| `type` | `"movie"` | `all` \| `movie` \| `tv` |
| `page` | `0` | 0-based |
| `limit` | `30` | |
| `sort` | `"newest"` | `newest` \| `oldest` \| `title` \| `rating` |
| `sortOrder` | `"desc"` | `asc` \| `desc` |
| `includeWatchHistory` | `true` | |
| `isTVdevice` | `true` | mobile genre pages may send `false` |

#### Response (`GenresContentResponse`)

```ts
{
  currentItems: MediaItem[];
  previousItem: MediaItem | null;
  nextItem: MediaItem | null;
  genreInfo: {
    requestedGenres: string[];
    totalResults: number;
    currentPage: number;
    totalPages: number;
  };
  filters: {
    type: "all" | "movie" | "tv";
    sort: "newest" | "oldest" | "title" | "rating";
    sortOrder: "asc" | "desc";
  };
}
```

**Pagination:** same `nextItem` + `currentItems.length` rules as horizontal-list.  
**Genre card previews:** may request small `limit` with `includeWatchHistory=false` and only use first N `posterURL`/`thumbnailUrl` values.

---

## 7. Media detail

### `GET /api/authenticated/media`

Detail screens, player bootstrap, season/episode switching.

#### Request query

| Param | Required | Notes |
|---|---|---|
| `mediaType` | yes | `movie` \| `tv` |
| `mediaId` | preferred | Internal id |
| `mediaTitle` | alternate | Title-based lookup |
| `season` | TV season fetch | number |
| `episode` | Episode-specific | number |
| `card` | no | Compact card payload |
| `isTVdevice` | no | **true** for enhanced layout (primary path in this app) |
| `includeWatchHistory` | no | **true** on watch + media-info |

Also supports `POST /api/authenticated/media` with body `{ mediaType, mediaTitle }` (legacy alternate; rarely used).

---

### 7.1 Enhanced response (`isTVdevice=true`) — `TVDeviceMediaResponse`

```ts
{
  id: string;
  title: string;
  type: string;
  posterURL: string;
  backdrop: string;
  posterBlurhash: string;
  backdropBlurhash: string;
  logo?: string;
  metadata: {
    overview: string;
    genres: Array<{ id: number; name: string }>;
    rating: string;              // content rating e.g. "PG-13", "TV-MA"
    vote_average: number;        // 0–10
    releaseDate: string;
    trailer_url: string;
    cast?: Array<{
      id: number;
      name: string;
      character: string;
      profile_path: string;
    }>;
    showOverview?: string;       // client may merge show-level overview here
  };
  availableSeasons: number[];
  totalSeasons: number;
  seasonNumber: number;
  episodes: Array<{
    episodeNumber: number;
    title: string;
    thumbnail?: string;
    thumbnailBlurhash?: string;
    duration: number;            // see duration note below
    description: string;
    videoURL: string;
    hdr: string;
    dimensions: string;
    watchHistory?: WatchHistory;
  }>;
  navigation: {
    seasons: {
      current: number;
      total: number;
      hasPrevious: boolean;
      hasNext: boolean;
    };
  };
  airDate?: string;
  duration?: number;             // movie / aggregate
  watchHistory?: WatchHistory;
  // Runtime extras used by player (may appear even if not in strict types):
  // captionURLs, videoURL (movies), etc.
}
```

#### Two-stage TV show fetch (client pattern)

1. **Show root** (no season):  
   `?mediaType=tv&mediaId=<id>&isTVdevice=true`  
   → `availableSeasons`, `navigation.seasons.current`, show metadata, cast, logo, backdrop.

2. **Season** (and optional episode):  
   `?mediaType=tv&mediaId=<id>&season=<n>&isTVdevice=true&includeWatchHistory=true`  
   → `episodes[]`, season poster, season overview.

Client merges: season overview into `metadata.overview`, preserves show overview as `metadata.showOverview`.

#### Episode-specific response (`episode` set)

May return `EpisodeSpecificResponse`:

```ts
{
  id, title, showTitle, type,
  posterURL, backdrop, posterBlurhash, backdropBlurhash,
  totalSeasons, seasonNumber,
  metadata: TVDeviceMetadata,
  logo?, hdr?, duration?, watchHistory?,
  episode: {
    episodeNumber, title, thumbnail?, thumbnailBlurhash?,
    duration, description, videoURL, hdr, dimensions,
    watchHistory?
  },
  cast?, guestStars?
}
```

**Player-critical fields:** `episode.videoURL` or top-level `videoURL`, `watchHistory.playbackTime`, ids, season/episode numbers for presence metadata, `captionURLs` when present.

#### `captionURLs` (on media / player payload)

Not fully modeled in `content.types.ts` but **required by the player UI**:

```ts
captionURLs?: {
  [displayLabel: string]: {
    srcLang: string;           // "en" or "eng"
    url: string;               // fully-qualified subtitle URL
    lastModified?: string;
    sourceServerId?: string;
    autoGenerated?: boolean;   // auto-caption pipeline
    pending?: boolean;         // stub not yet on disk
  };
};
```

See [`auto-captions-client-architecture.md`](./auto-captions-client-architecture.md).

---

### 7.2 Non-TV / flat response — `MediaDetailsResponse`

When `isTVdevice` is omitted/false:

```ts
{
  id?: string;
  title?: string;
  link?: string;                 // legacy path
  videoURL?: string;             // preferred stream URL
  posterURL?: string;
  backdrop?: string;
  hdr?: string;
  logo?: string;
  type?: "movie" | "tv";
  duration?: number;
  releaseDate?: string;
  description?: string;
  episodeNumber?: number;
  seasonNumber?: number;
  lastWatchedDate?: string;
  overview: string;
  watchHistory?: WatchHistory;
  metadata?: {
    overview?: string;
    rating?: string;
    release_date?: string;
    genres?: Array<{ id: number; name: string }>;
    [key: string]: unknown;
  };
  mediaQuality?: {
    format?: string;
    bitDepth?: number;
    colorSpace?: string;
    transferCharacteristics?: string;
    isHDR?: boolean;
    viewingExperience?: {
      enhancedColor?: boolean;
      highDynamicRange?: boolean;
      dolbyVision?: boolean;
      hdr10Plus?: boolean;
      standardHDR?: boolean;
    };
    [key: string]: unknown;
  };
  cast?: Array<{
    character?: string;
    id?: number;
    name?: string;
    profile_path?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;        // open for captionURLs, etc.
}
```

#### Duration units (important)

`duration` is **milliseconds** everywhere the server sends it — movies, episodes and list rows alike. Every consumer in this client divides by 1000 before comparing with `playbackTime` (seconds); `src/utils/watchProgress.ts` is the one place that conversion lives. Only the server's `metadata.runtime` mixes minutes and milliseconds, and no code here reads it. Do not "fix" a bar by treating movie duration as seconds — that is what breaks movie progress.

#### Delivery semantics (server-emitted, optional)

`sanitizeTVData` also emits `playbackSource` (how `videoURL` is being delivered: a JIT master, or the raw file because the transcoder cannot take the title), the `mid:` resolved catalog id stamped on presence rows, and `rawVideoURL`. The client reads `playbackSource === "raw"` to label the quality menu when `direct-info` answers 404 for a raw-served title. The web repository's copy of this contract is the tracked source for those fields; this file carries only what the client consumes.

---

## 8. Banner

### `GET /api/authenticated/banner?isTVdevice=true`

Client **always** sends `isTVdevice=true` so the server exposes `clipVideoURL`.
Returns up to 8 movies, newest `metadata.release_date` first. Every user gets
the same list; the server caches it and drops the cache when a sync or an
admin edit changes movies (other changes show within 30 s).

#### Response (`BannerItem[]`)

Since 27 September 2026 the server sends a **fixed field list**
(`BANNER_FIELDS` on the server) instead of the whole movie record. Nothing
outside this table is sent; a new field has to be added on the server first.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Database id |
| `title` | string | Display title. **Show this one.** |
| `originalTitle` | string | Library key (folder name). For lookups and links; don't display |
| `type` | string | `"movie"` |
| `backdrop` | string (URL) | Falls back to TMDB's original-size backdrop |
| `backdropBlurhash` | string | Placeholder while the backdrop loads |
| `backdropFocal`, `backdropFocalSuggested` | string, optional | `left`, `left-center`, `center`, `right-center`, `right`. `backdropFocal` is an admin override and wins |
| `logo` | string (URL), optional | Title logo |
| `videoURL`, `duration`, `videoSource`, `videoInfoSource` | string, number (ms), string, string | Sent so the server can build `clipVideoURL`. **Don't play from these**; get playback URLs from `/media` |
| `metadata.id` | number | TMDB id |
| `metadata.overview` | string | Synopsis |
| `metadata.genres` | `Array<{ id, name }>` | |
| `metadata.vote_average` | number | TMDB rating, 0–10 |
| `metadata.release_date` | string | `YYYY-MM-DD`, the sort key |
| `metadata.trailer_url` | string, optional | |
| `metadata.logo_path`, `metadata.backdrop_path` | string, optional | TMDB image paths (relative) |
| `clipVideoURL` | string, optional | Only with `isTVdevice=true`, and only for movies with a video and a duration. Up to 50 s clip for the background preview. Always `video/mp4` with a `Content-Length`. May run longer than 50 s, because the clip starts on the keyframe before the requested start. The first request for a clip the server has not made yet takes a few seconds (copy) or 20 s or more (encode); after that it is served from the server's cache |

The app's `BannerItem` type declares the subset it reads: `id`, `title`,
`type`, `backdrop`, `backdropBlurhash`, `logo`, `clipVideoURL`, and
`metadata.overview` / `genres` / `vote_average` / `release_date` / `trailer_url`.

#### Empty library and errors

- No movies: **200** with an object, not an array:
  `{ "error": "No media found for banner", "status": 404 }`.
  `contentService.getBanner` normalises any non-array body to `[]`.
- Server failure: **500** with `{ "error": "Failed to fetch banner media", "details": "…" }`.

**UI usage:** rotating hero; optional video clip when `clipVideoURL` present; logo + backdrop + overview/genres/rating.
Fetched on mount and on app foreground only (no interval polling).

---

## 9. Screensaver

### `GET /api/authenticated/screensaver`

#### Request

```
?analyzeContrast=true&animationPlacement=true&preferPosition=bottom
```

#### Response (`ScreensaverResponse`)

```ts
{
  _id: string;
  type: "movie" | "tv";
  title: string;
  logo?: string;
  backdrop: string;
  backdropBlurhash?: string;
  network?: {
    name: string;
    logo_url: string;
  };
  contrastAnalysis?: {
    needsAdjustment: boolean;
    recommendedOverlay?: { color: string; opacity: number };
    logoLuminance?: number;
    backdropLuminance?: number;
    contrastRatio?: number;
    logoHasTransparency?: boolean;
    logoTransparencyRatio?: number;
    backdropDominantArea?: "dark" | "light" | "mixed";
    backdropHasContrastingRegions?: boolean;
    regionLuminances?: number[];
    contrastThreshold?: number;
    imageSources?: {
      logo?: "cache" | "remote" | "unknown";
      backdrop?: "cache" | "remote" | "unknown";
    };
  };
  animationPlacement?: {
    verticalPosition: "top" | "center" | "bottom";
    horizontalPosition: "left" | "center" | "right";
    startSide: "left" | "right" | "top" | "bottom";
    animationPath: "linear" | "curved" | "wave" | "diagonal";
    contrastRatios?: Record<string, number>;
    regionLuminances?: Record<string, number>;
    horizontalContrast?: boolean;
    luminanceVariance?: number;
    reason?: string;
  };
}
```

**Caching:** client uses `staleTime: 0` / `gcTime: 0` — always fetch fresh for variety.

---

## 10. Watchlist

Two route families:

- `/api/authenticated/watchlist-content` — read playlists + playlist items  
- `/api/authenticated/watchlist` — status / add / toggle / remove  

---

### 10.1 Playlists metadata

### `GET /api/authenticated/watchlist-content?action=playlists`

| Param | Default |
|---|---|
| `action` | `"playlists"` |
| `includeItemCounts` | `true` |
| `includeDefaultPlaylist` | `true` |
| `visibilityFilter` | optional string |

#### Response

```ts
{
  playlists: Array<{
    id: string;
    name: string;
    description?: string;
    privacy?: "private" | "public" | string;
    isDefault?: boolean;
    hideUnavailable?: boolean;
    itemCounts?: {
      total: number;
      available: number;
      unavailable: number;
      movie?: number;
      tv?: number;
    };
    dateCreated?: string;
    dateUpdated?: string;
  }>;
  defaultPlaylistId?: string;
}
```

---

### 10.2 Playlist content

### `GET /api/authenticated/watchlist-content?action=content`

| Param | Default | Notes |
|---|---|---|
| `action` | `"content"` | |
| `playlistId` | required | |
| `page` | `0` | |
| `limit` | `30` | |
| `mediaType` | optional | `movie` \| `tv` |
| `isTVdevice` | `false` in service default; TV my-list may pass `true` | |
| `includeWatchHistory` | `true` | |
| `includeUnavailable` | optional | my-list often `true` |
| `hideUnavailable` | optional | my-list often `false` |

#### Response

```ts
{
  currentItems: MediaItem[];
  previousItem: MediaItem | null;
  nextItem: MediaItem | null;
  pagination: {
    currentPage: number;
    totalResults: number;
    totalPages: number;
    hasNextPage: boolean;      // preferred by infinite watchlist hook
    hasPreviousPage: boolean;
  };
  playlistInfo: {
    id: string;
    name: string;
    description?: string;
    hideUnavailable?: boolean;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  };
}
```

---

### 10.3 Status / mutations — `/api/authenticated/watchlist`

#### Status — `GET .../watchlist?action=status`

Query: `tmdbId` and/or `mediaId`, `mediaType`, optional `playlistId`.

```ts
// Response
{ success: boolean; inWatchlist: boolean; item?: Record<string, unknown> }
```

#### Add — `POST .../watchlist?action=add`

```ts
// Body
{
  tmdbId?: number;
  mediaId?: string;
  mediaType: "movie" | "tv";
  title: string;
  playlistId?: string;
}
```

#### Toggle — `POST .../watchlist?action=toggle`

Same body as add.

```ts
// Response
{
  success: boolean;
  action?: "added" | "removed";
  message?: string;
  item?: Record<string, unknown>;
}
```

#### Remove — `DELETE .../watchlist?action=remove`

Query: `tmdbId` / `mediaId`, `mediaType`, optional `playlistId`.

```ts
// Response
{ success: boolean; action?: "added" | "removed"; message?: string; item?: ... }
```

---

## 11. Search

### `POST /api/authenticated/search`

#### Request body

```ts
{
  query: string;           // empty string ⇒ “recently added” style results
  isTVdevice?: boolean;
  limit?: number;          // omitted if not provided
}
```

#### Response

```ts
{ results: MediaItem[] }
```

Client maps `_id` → `id` if needed. Search UI often maps:

```ts
thumbnailUrl: item.posterURL
backdropUrl: item.backdrop
```

---

## 12. Playback & presence

### 12.1 Update playback

### `POST /api/authenticated/sync/updatePlayback`

#### Headers

- `Authorization: Bearer ...`
- `User-Agent: <device-generated>` (platform-specific string from `generateUserAgent()`)

#### Body (`PlaybackUpdateRequest`)

```ts
{
  videoId: string;           // typically the full video URL string
  playbackTime?: number;     // seconds; present on progress/final, ABSENT on keepalive
  kind?: "progress" | "keepalive" | "final";  // default progress
  sessionId?: string;        // presence session; OMIT on final flush paired with presence/end
  isPaused: boolean;
  mediaMetadata: {
    mediaType: "tv" | "movie";
    mediaId: string;         // the client's best guess; the server discards it and stamps its own resolved id
    showId?: string;         // TV
    seasonNumber?: number;   // TV; 0 is a real season (specials)
    episodeNumber?: number;  // TV
  };
}
```

**Write kinds.** `keepalive` is liveness only: the server MUST NOT write a position or `lastWriter` for it (a paused device would otherwise drag the row back over progress made on another device). `final` marks the exit flush so a mid-session beat and an exit can be told apart. Older builds send neither field; the server treats a paused write whose position equals the session's last presence position as liveness only, which covers them.

#### Client cadence

| State | Behavior |
|---|---|
| Playing | `progress` every ~**30s** of media time, or on a seek of more than 10s |
| Pause | Immediate `progress` with the paused position |
| Paused | `keepalive` every ~**180s**, no position |
| Exit, info, episode switch | `final` flush **without** `sessionId`, then `presence/end`; tracking detached before navigating |
| Background | `progress` (playing — PiP stays alive) or `final` + `presence/end` (paused) |
| Unclean unmount | `final` + `presence/end`, fire-and-forget |
| Resume seek pending | No writes until the seek lands (`isResumePending`) |

**Resurrection footgun:** If a final `updatePlayback` includes `sessionId` while a concurrent `presence/end` runs, whichever lands last wins. Client deliberately omits `sessionId` on that final pair.

---

### 12.2 End presence

### `POST /api/authenticated/sync/presence/end`

```ts
// Body
{ sessionId: string }
```

Idempotent — safe if session already gone.

---

### 12.3 Validation status

### `POST /api/authenticated/sync/updateValidationStatus`

```ts
// Body
{ videoId: string; isValid: boolean }
```

Used to mark watch-history entries valid/invalid after playback checks.

---

### 12.4 Delivery-tier verdict (proxied direct.json)

### `GET /api/authenticated/media/direct-info?mediaType=&mediaId=&season=&episode=`

The authenticated proxy of jit-transcoder's `GET /stream/{key}/direct.json`
(see `FRONTEND_PLAYBACK_REQUIREMENTS.md` §3). The server resolves the stream
key from the media identity, forwards the verdict, and enriches it with
display fields so all client surfaces share one mapping.

```ts
// Response (DirectPlayInfo — src/data/types/directPlay.types.ts)
{
  hls: {
    offered: boolean;              // Original-over-HLS copy rung exists on ?direct=1
    reason?: string;               // withhold reason when offered=false (open-gop-avc, …)
    variantIndex?: number;
    codecs?: string;
    bandwidth?: number;
    averageBandwidth?: number;
    videoRange?: string;           // "PQ" on HDR10/DV base layers
    supplementalCodecs?: string;   // presence ⇒ Dolby Vision
  };
  file: {
    available: boolean;            // GET /stream/{key}/file serves original bytes
    sizeBytes?: number;
    container?: string;
    videoCodec?: string;
  };
  badgeLabel?: string;             // enriched: "Original (Dolby Vision)" | "Original (HDR10)" | "Original"
  reasonCopy?: string;             // enriched: user copy for `reason`
}
```

Client behavior (both watch screens, `useDirectPlayInfo`):

- Fetched at **playback-open only** — never from browse/info surfaces, because
  the first request for an eligible title triggers the server's one-time
  keyframe derivation (seconds on MP4, minutes on a huge un-indexed MKV).
- `season`/`episode` are sent for shows — the verdict is per playable file.
- `404` (pre-deploy server, or feature off) is treated as
  `{ hls: { offered: false }, file: { available: false } }`: the quality menu
  simply lacks Original and nothing else regresses.
- Timeouts/5xx are treated as "no verdict yet"; the client re-queries at a
  generous interval while the watch screen stays open.
- The proxy SHOULD use a long upstream timeout (derivation), cache in line
  with the transcoder's memoization, and send `Cache-Control: no-store` like
  the media routes.

Related client source policy (app-local, not server contract; the
authoritative statement is `FRONTEND_PLAYBACK_REQUIREMENTS.md` §11.1 and
`src/utils/qualityTiers.ts`): on every native platform **Auto** (default) is
the `?direct=1` master, **Original** is the `?direct=only` master, **Direct
Play** (Android only) is `/stream/{key}/file` when `file.available` and the
device does not veto it, and **Transcoded only** is the bare master.
Heartbeat `videoId` stays the canonical un-suffixed `videoURL` (quirk #8).

A **504** with `Retry-After` means the verdict is still being derived, never
"nothing offered": the client keeps polling on that interval for as long as
the watch screen is open, without counting it as a failure.

---

#### 12.4.1 Audio surfaces and index facts (jit-transcoder commit e84afb9, not yet deployed)

Additive fields on the same verdict. Nothing existing changed shape; production currently
runs a server build that predates all of them, so clients treat every one as optional.

| Field | Meaning | Native-app use |
|---|---|---|
| `file.audioTracks[]` | Every audio track the container holds: `index` (ffmpeg `0:a:{n}`), `codec`, `channels`, `language` (BCP-47 or null), `title`, `default`, `descriptive` (commentary / audio description, from dispositions or the four title keywords) | Joined into audio ranking on the raw-file tier: a track the server marks `descriptive` ranks below every main mix even when its title carries no keyword |
| `original.audio[]` | The renditions an Original master carries: `groupId` (`aud-aac`, `aud-ec3`, `aud-ac3`), `language`, `channels`, `codecs`, `bitrate`, `default`, `sourceTrack` (joins to `file.audioTracks[].index`) | Not consumed yet; would let the audio menu render without fetching the master |
| `file.dvProfile` | The source's Dolby Vision profile (5, 7, 8) or null. Not `hls.supplementalCodecs`, which is what the server signals and reads null for a profile-7 source | Device-side veto on Android against the decoder's advertised profiles (native probe); profile 7 is withheld even before the probe answers |
| `file.audioCodecs`, `file.moovBytes`, `file.sampleCount`, `file.indexClass` | Raw-file index facts. Matroska reports `moovBytes: null`, `sampleCount: null`, `indexClass: "not-applicable"` (no whole-file sample table) | MP4-family files with `sampleCount` above 10 M are withheld from the raw-file tier on Android (ExoPlayer's sample table ≈ 24 bytes/sample on a 512 MB heap); without a count, TrueHD in MP4 is withheld. `indexClass` values are not yet documented and are not consulted |

`GET /stream/{key}/master.m3u8?direct=only` (jit-transcoder commit c35deea, same deploy) lists
the Original copy rung and nothing transcoded — one `EXT-X-STREAM-INF` per audio group, all the
same URI, each `STABLE-VARIANT-ID="original"`; the audio groups are exactly `original.audio`.
The native app's **Original** tier is this master, requested only when `hls.offered` is true
and the verdict carries the `original` block (same-deploy marker). A 404 carries
`{"error": "original not available for this source: <reason>"}` and the app descends at once,
never retrying the URL. One further correction in that deploy: a source whose codec string
cannot be expressed now reports `offered: false, reason: "unmappable-codec"` (treated like
`ineligible-source`) instead of `offered: true` with a null `variantIndex`.

Still open with the transcoder side: the `indexClass` enum and its thresholds.

## 13. Player support assets

### 13.1 Subtitles

### `GET /api/authenticated/subtitles`

| Param | Notes |
|---|---|
| `name` | Original title |
| `language` | Label key, e.g. `"English"` or `"English - Auto Generated"` |
| `type` | `movie` \| `tv` |
| `season` | TV required |
| `episode` | TV required |
| `auto` | `true` engages auto-caption pathway |
| `_t` | optional cache-bust timestamp |

**Responses (auto path):**

| Status | Body | Meaning |
|---|---|---|
| `200` | `text/vtt` | Ready — render cues |
| `202` | JSON job stub | Generating — poll job |
| `401` / `429` / `503` / `5xx` | JSON error | See auto-captions doc |

Full auto-caption state machine: [`auto-captions-client-architecture.md`](./auto-captions-client-architecture.md).

Job poll (referenced by that doc):

```
GET /api/authenticated/captions/jobs/:jobId?serverId=<optional>
```

---

### 13.2 Thumbnails

### `GET /api/authenticated/thumbnails`

Query: `name`, `type`, `season?`, `episode?`  
Response: loosely typed (`Record<string, unknown>`) — sprite / VTT style payload for scrub previews.

---

### 13.3 Chapters

### `GET /api/authenticated/chapter`

Query: `name`, `type`, `season?`, `episode?`  
Response: loosely typed chapter markers.

---

### 13.4 Episode picker

### `GET /api/authenticated/episode-picker?title=<show>&season=<n>`

Response typed as open object (`EpisodePickerResponse`). Prefer `/media` with `isTVdevice=true` for structured episode lists in this app.

---

## 14. Server health probe

### `GET /api/status`

**Unauthenticated.** A Mongo ping: `200` when the database answers, `503` when
it does not. This is the only liveness check the app makes; it does **not**
call `/api/authenticated/system-status` (that route needs a session, fans out
to every file server per request, and is the admin dashboard's concern).

#### Response

```ts
// 200
{ ok: true; status: string; db: { statusText: "Up"; details: string } }
// 503
{ ok: false; error: string; db: { statusText: "Down"; details: string } }
```

The client reads only the status code.

#### When the client calls it

`src/stores/serverHealthStore.ts` owns this. A request that gets no response
or a 5xx makes the server a *suspect*; one probe goes out 1 s later. If it
fails, a second goes out 3 s after that; two failures in a row show the TV
banner ("Can't reach the server"), after which the probe repeats every 10 s.
A `503` shows a separate "database isn't responding" notice. Any successful
response from any endpoint, including the session poll, clears everything at
once. While the device reports itself offline nothing is probed and nothing
is blamed on the server.

Request details: `cache: "no-store"`, `credentials: "omit"`, an 8 s abort,
and a unique `?_=<timestamp>` query: until server commit `0fe6d6a` ships,
the route sends no `Cache-Control`, and NSURLCache on tvOS would otherwise
keep answering an old `200` for the length of an outage. Nothing is sent
while signed out.

Server side, merged 2026-10-10 as commit `0fe6d6a` (not live until the
production image is rebuilt): the route sends `Cache-Control: no-store`;
`db.details` is a fixed phrase ("MongoDB is not responding"), never the
driver's error text; and the ping is capped at 2 s, so a dead or saturated
Mongo returns `503` within about 2 s, well inside the client's 8 s abort.
Response shapes are unchanged.

For the record, since the old client code expected otherwise:
`/api/authenticated/system-status` reports `overall.level` and
`servers[].level` from `normal | elevated | heavy | critical | unknown`,
never `warning` or `error`.

---

## 15. Counts & calendar

### `GET /api/authenticated/count`

Optional `?type=recentlyWatched`.

```ts
// Default-ish
{
  moviesCount?: number;
  tvShowsCount?: number;
  total?: number;
  movieHours?: number;
  tvHours?: number;
  totalHours?: number;
}

// type=recentlyWatched
{
  hasWatchHistory?: boolean;
  count?: number;
}
```

### `GET /api/authenticated/calendar/sonarr`  
### `GET /api/authenticated/calendar/radarr`

Response: **iCal string** (`text` / string body).

---

## 16. Endpoint inventory

### Used by this client (primary)

| Method | Path | Role |
|---|---|---|
| POST | `/api/auth/device/code` | Device login start |
| POST | `/api/auth/device/token` | Device login poll |
| GET | `/api/auth/get-session` | Session / user |
| POST | `/api/auth/sign-out` | Logout |
| GET | `/api/authenticated/horizontal-list` | Browse rows / grids |
| GET | `/api/authenticated/genres` | Genre list + content |
| GET | `/api/authenticated/media` | Detail + player |
| GET | `/api/authenticated/media/direct-info` | Delivery-tier verdict (proxied direct.json, §12.4) |
| POST | `/api/authenticated/media` | Legacy detail |
| GET | `/api/authenticated/banner` | Home banner |
| GET | `/api/authenticated/screensaver` | TV idle |
| GET | `/api/authenticated/watchlist-content` | Playlists + items |
| GET/POST/DELETE | `/api/authenticated/watchlist` | Status / mutate |
| POST | `/api/authenticated/search` | Search |
| POST | `/api/authenticated/sync/updatePlayback` | Progress + presence heartbeat |
| POST | `/api/authenticated/sync/presence/end` | End presence |
| POST | `/api/authenticated/sync/updateValidationStatus` | Validate history entry |
| GET | `/api/authenticated/subtitles` | Captions / auto |
| GET | `/api/authenticated/thumbnails` | Scrub sprites |
| GET | `/api/authenticated/chapter` | Chapters |
| GET | `/api/authenticated/episode-picker` | Legacy picker |
| GET | `/api/authenticated/count` | Library stats |
| GET | `/api/authenticated/calendar/:endpoint` | iCal |
| GET | `/api/status` | Server health probe (unauthenticated, §14) |

### Declared but secondary / admin

Defined in `API_ENDPOINTS` for completeness; not primary browse UI:

- `GET /api/authenticated/list` — full file-server dump (admin/webhook)
- Notifications: `/api/authenticated/notifications`, `.../mark-read`, `.../dismiss` (keys exist; limited UI wiring)
- Admin: `/api/authenticated/admin/*` (media, users, radarr, sonarr, sabnzbd, tdarr, servers, sync, wipe-db, etc.)

---

## 17. Known client quirks

Document these so backend changes don’t “fix” the app unexpectedly.

1. **`useInfiniteContentList` always sends `isTVdevice=true`** and forwards `includeWatchHistory` (defaulting to true for `recentlyWatched`). Continue Watching cards draw a resume bar from `watchHistory` when the row also carries `duration` (ms) or `progressPercent`.

2. **`contentService.getContentList` / non-infinite `useContentList`** only send `type, sort, sortOrder, page, limit` — no device/history flags.

3. **Pagination depends on `nextItem`**, not only page size. Last page must set `nextItem: null`.

4. **Dual image keys** — always support `posterURL`/`thumbnailUrl` and `backdrop`/`backdropUrl` fallbacks.

5. **Search `_id` vs `id`** — client normalizes, but prefer `id`.

6. **Banner `clipVideoURL`** only requested via `isTVdevice=true`.

7. **Duration is milliseconds** for movies and episodes alike; the client divides by 1000 everywhere. Keep server units stable.

8. **`videoId` in playback updates is the stream URL string**, not necessarily the media document id. `mediaMetadata.mediaId` is the client's guess at the catalog id; the server discards it and stamps its own resolved `mid:`. **Delivery-tiers amendment:** the client always sends the *canonical* master URL — `videoURL` exactly as the media payload delivered it, with any tier surgery reversed (`?direct=1` stripped, a `/file` path mapped back to `master.m3u8`; see `src/utils/streamUrls.ts` `canonicalVideoId()`). The server hashes the pathname and folds every `/stream/<key>/…` tail itself, so this keeps stored ids tidy rather than preventing a split.

9. **Presence finalization** omits `sessionId` on the last progress write when paired with `presence/end`.

10. **Auth Origin header** — RN clients send `Origin: <server origin>` and `credentials: omit` for better-auth CSRF compatibility.

---

## 18. Field usage matrix (`MediaItem`)

| Field | Required for basic card | Progress / resume | Nav / deep link | Watchlist | Notes |
|---|---|---|---|---|---|
| `id` | ✅ | | ✅ | | |
| `title` | ✅ | | | ✅ (write body) | |
| `type` | ✅ | | ✅ | ✅ | |
| `posterURL` or `thumbnailUrl` | ✅ | | | | one required |
| `posterBlurhash` / `thumbnailBlurhash` | nice | | | | |
| `backdrop` or `backdropUrl` | nice | | focus transitions | | |
| `backdropBlurhash` | nice | | | | |
| `link` | ✅ for playable | | availability | | empty ⇒ unavailable |
| `hdr` | nice | | | | subtitle chrome |
| `logo` | nice | | | | |
| `tmdbId` | | | | ✅ status/toggle | |
| `seasonNumber` / `episodeNumber` | recently watched | | ✅ | | |
| `watchHistory` | | ✅ | | | when flag/default on |
| `isAvailable` / coming soon | nice | | | | |
| `isTrailer` | nice | | | | badge |
| `metadata` | optional | | | | overview etc. |
| `lastWatchedDate` | typed | | | | |

---

## Appendix A — Minimal backend checklist for this client

- [ ] Bearer auth on `/api/authenticated/*`
- [ ] Device auth endpoints for login
- [ ] `horizontal-list` with `type/sort/sortOrder/page/limit` + `nextItem` pagination
- [ ] `isTVdevice` changes `/media` and `/banner` shapes
- [ ] `includeWatchHistory` attaches `WatchHistory` where requested
- [ ] Dual poster/backdrop keys (or reliable single key per pair)
- [ ] Genres list + content actions
- [ ] Watchlist content + status/toggle
- [ ] Search POST `{ query, isTVdevice?, limit? }` → `{ results }`
- [ ] `updatePlayback` + `presence/end` contract
- [ ] Media payload includes `videoURL` / episode `videoURL` and optional `captionURLs`
- [ ] Subtitles endpoint (incl. auto 200/202 behavior)

---

## Appendix B — TypeScript source map

| Concern | File |
|---|---|
| Paths | `src/data/api/endpoints.ts` |
| Content types | `src/data/types/content.types.ts` |
| Auth types | `src/data/types/auth.types.ts` |
| Server health probe | `src/stores/serverHealthStore.ts` |
| HTTP service | `src/data/services/contentService.ts` |
| React Query hooks | `src/data/hooks/queries/useContentQueries.ts` |
| Infinite lists | `src/data/hooks/queries/useInfiniteContentQueries.ts` |
| Legacy/state hooks | `src/data/hooks/useContent.ts` |
| Axios / auth interceptors | `src/data/api/axiosClient.ts`, `enhancedClient.ts` |
| Presence heartbeats | `src/hooks/usePlaybackPresenceTracking.ts` |
| Resume apply | `src/hooks/useWatchHistoryApplication.ts` |

---

*Generated from the `nextjs-stream-tv-mobile` client codebase. Update this doc when request params or consumed response fields change.*
