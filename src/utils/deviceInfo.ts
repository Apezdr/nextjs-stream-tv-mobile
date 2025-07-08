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

  return {
    brand: extendedPlatform.constants?.Brand,
    model: extendedPlatform.constants?.Model,
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
