import { Platform } from "react-native";

import type { DeviceInfo } from "@/src/data/types/auth.types";

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
