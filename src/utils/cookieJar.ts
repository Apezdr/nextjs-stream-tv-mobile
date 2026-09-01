/**
 * Control over the Android OS cookie jar.
 *
 * React Native's fetch on Android goes through OkHttp, whose cookie jar
 * (ForwardingCookieHandler) delegates to `android.webkit.CookieManager` and
 * attaches whatever that store holds regardless of `credentials`. This app
 * authenticates with Bearer tokens and never wants a cookie on an auth
 * request, so anything left in that store is pure liability: better-auth's
 * get-session answers from a cached `session_data` cookie *before* it inspects
 * the Authorization header, which on shared TV hardware means a user who just
 * signed in can be handed the previous user's session as a valid 200.
 *
 * The per-request guards (`disableCookieCache=true`, `credentials: "omit"`)
 * stay in place, but they only stop the stale cookie from being believed.
 * This removes it.
 */
import { NativeModules, Platform } from "react-native";

/** The slice we use of @react-native-cookies/cookies' Android native module. */
type CookieManagerAndroid = {
  /** Resolves to whether any cookie was removed. Flushes the store itself. */
  clearAll: (useWebKit: boolean) => Promise<boolean>;
};

/**
 * Drop every cookie in the OS jar. Resolves to whether anything was cleared;
 * always false off Android, where there is no jar to clear.
 *
 * Best-effort by design. Callers use this to remove a credential that should
 * never have been there, not to establish one, so a failure must not block a
 * sign-in or strand a sign-out — it logs and resolves.
 *
 * Reads the native module straight off `NativeModules` rather than importing
 * the package's JS entry, which throws an invariant at import time when its
 * native half is absent. That entry keys off `Platform.OS`, which is "ios" on
 * tvOS, so importing it would crash the Apple TV app at startup — and the
 * package is autolinked on Android only (see react-native.config.js), because
 * its iOS implementation needs WebKit, which tvOS does not have.
 */
export async function clearCookieJar(): Promise<boolean> {
  if (Platform.OS !== "android") return false;

  const cookieManager = NativeModules.RNCookieManagerAndroid as
    CookieManagerAndroid | undefined;

  if (!cookieManager) {
    console.warn(
      "[Auth] RNCookieManagerAndroid is missing — the OS cookie jar was not cleared",
    );
    return false;
  }

  try {
    // useWebKit is an iOS-only distinction; Android has one store either way.
    return await cookieManager.clearAll(false);
  } catch (e) {
    console.warn("[Auth] Failed to clear the OS cookie jar", e);
    return false;
  }
}
