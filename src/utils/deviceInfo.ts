import { Platform } from "react-native";

interface DeviceInfo {
  brand?: string;
  model?: string;
  platform: string;
}

// Extend the Platform interface to include the additional properties
// that are available in react-native-tvos but not in the base React Native types
interface ExtendedPlatformConstants {
  Brand?: string;
  Manufacturer?: string;
  Model?: string;
  Release?: string;
  Version?: number;
  uiMode?: string;
  reactNativeVersion?: {
    major: number;
    minor: number;
    patch: number;
    prerelease?: string;
  };
}

interface ExtendedPlatform {
  constants: ExtendedPlatformConstants;
  OS: string;
  Version: string | number;
  isTV: boolean;
}

/**
 * Extract basic device information from React Native Platform
 */
export function getDeviceInfo(): DeviceInfo {
  const extendedPlatform = Platform as ExtendedPlatform;

  // Ensure all fields are strings to avoid server validation issues
  let brand = extendedPlatform.constants?.Brand;
  let model = extendedPlatform.constants?.Model;

  // Handle tvOS specific cases where Brand/Model might be undefined
  if (Platform.isTV) {
    if (Platform.OS === "ios") {
      // Apple TV
      brand = brand || "Apple";
      model = model || "Apple TV";
    } else if (Platform.OS === "android") {
      // Android TV
      brand = brand || "Android";
      model = model || "Android TV";
    }
  }

  // Fallback values for any remaining undefined cases
  brand = brand || Platform.OS;
  model = model || "Unknown";

  return {
    brand,
    model,
    platform: Platform.OS,
  };
}

/**
 * Determine the appropriate device type based on Platform information
 */
export function getDeviceType(): "tv" | "mobile" | "tablet" | "desktop" {
  if (Platform.isTV) {
    return "tv";
  }

  // For React Native, we're primarily dealing with mobile/tablet
  // Could be enhanced in the future to detect tablet vs mobile based on screen size
  return "mobile";
}

export type PlatformClass = "apple-tv" | "ios" | "android-tv" | "android" | "web";

/**
 * Apple platforms (iOS AND tvOS — react-native-tvos reports "ios" for Apple
 * TV). Drives the delivery-tier source policy: Apple players get the
 * `?direct=1` master by default.
 */
export function isApplePlatform(): boolean {
  return Platform.OS === "ios";
}

/**
 * Android TV / Fire TV (Android with the TV UI mode).
 */
export function isAndroidTV(): boolean {
  return Platform.OS === "android" && Platform.isTV;
}

/**
 * Four-way platform split for source-selection policy decisions.
 */
export function getPlatformClass(): PlatformClass {
  if (Platform.OS === "web") return "web";
  if (Platform.OS === "ios") {
    return Platform.isTV ? "apple-tv" : "ios";
  }
  return Platform.isTV ? "android-tv" : "android";
}

/**
 * Generate a user agent string with platform information for API requests
 */
export function generateUserAgent(): string {
  const deviceInfo = getDeviceInfo();
  const deviceType = getDeviceType();

  // Create a descriptive user agent string
  // Format: "NextJSStreamTVApp/{version} ({platform}; {deviceType}; {brand} {model})"
  const appName = "NextJSStreamTVApp";
  const appVersion = "1.0.0"; // This could be pulled from app.json or package.json in the future

  const platformString = `${deviceInfo.platform}; ${deviceType}; ${deviceInfo.brand} ${deviceInfo.model}`;

  return `${appName}/${appVersion} (${platformString})`;
}
