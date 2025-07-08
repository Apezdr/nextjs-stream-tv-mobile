/**
 * Type definitions for authentication
 */

export interface User {
  id: string;
  name: string;
  email: string;
  approved: boolean;
  limitedAccess?: boolean;
  admin?: boolean;
}

export interface RegisterSessionRequest {
  clientId: string;
}

export interface RegisterSessionResponse {
  sessionId: string;
  expiresAt: number;
}

export interface TokenCheckResponse {
  status: "pending" | "complete" | "expired";
  tokens?: {
    user: User;
    mobileSessionToken: string;
    sessionId: string;
  };
}

export interface UserStatusResponse {
  user: User;
  sessionExpired?: boolean;
}

export interface DeviceInfo {
  brand?: string;
  model?: string;
  platform: string; // "android", "ios", etc.
}

export interface QRSessionRequest {
  clientId: string;
  deviceType: "tv" | "mobile" | "tablet" | "desktop";
  host?: string;
  deviceInfo: DeviceInfo;
}

export interface QRSessionResponse {
  qrSessionId: string;
  expiresAt: number;
  qrData: {
    qrSessionId: string;
    host: string;
    deviceType: string;
  };
}

export interface QRSessionInfo {
  qrSessionId: string;
  deviceType: string;
  host: string;
  status: "pending" | "complete" | "expired";
  createdAt: number;
  expiresAt: number;
}

export interface QRAuthRequest {
  qrSessionId: string;
  providerId: string;
}

export interface QRTokenCheckResponse {
  status: "pending" | "complete" | "expired";
  tokens?: {
    user: User;
    mobileSessionToken: string;
    sessionId: string;
  };
}
