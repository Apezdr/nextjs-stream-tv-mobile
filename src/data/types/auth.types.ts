/**
 * Type definitions for authentication (better-auth device authorization flow)
 */

export interface User {
  id: string;
  name: string;
  email: string;
  approved: boolean;
  limitedAccess?: boolean;
  role?: "user" | "admin";
  /** Derived from role === 'admin'; kept for UI compatibility */
  admin?: boolean;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  /** verification_uri with user_code embedded — use this for QR codes */
  verification_uri_complete: string;
  expires_in: number;
  /** Polling interval in seconds; server minimum is 5s */
  interval: number;
}

export interface DeviceTokenSuccess {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
}

export interface DeviceTokenError {
  error:
    | "authorization_pending"
    | "slow_down"
    | "access_denied"
    | "expired_token";
}

export interface GetSessionResponse {
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: string;
  };
  user: User;
}
