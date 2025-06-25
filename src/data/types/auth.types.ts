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
