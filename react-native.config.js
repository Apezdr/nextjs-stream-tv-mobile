/**
 * React Native autolinking overrides (read by Expo's autolinking too).
 *
 * @react-native-cookies/cookies is linked on Android ONLY, deliberately.
 *
 * Its iOS implementation is built on WKWebsiteDataStore (`#import
 * <WebKit/WebKit.h>`) and its podspec declares `s.platform = :ios`. WebKit
 * does not exist on tvOS, so autolinking it would fail the Apple TV build at
 * `pod install`. We also don't need it on any Apple platform: iOS and tvOS
 * honour `credentials: "omit"` and never attach the OS cookie jar in the
 * first place. Android is the sole platform that ignores that flag, which is
 * why the native jar has to be cleared explicitly there.
 *
 * Expo resolves `platforms.tvos` by falling back to `platforms.ios` when it is
 * unset, so this single `ios: null` disables both Apple targets.
 */
module.exports = {
  dependencies: {
    "@react-native-cookies/cookies": {
      platforms: { ios: null },
    },
  },
};
