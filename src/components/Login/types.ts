// Shared types for Login components
export interface Provider {
  id: string;
  name: string;
  type: string;
}

export type LoginStage = "enter" | "choose" | "qr";

export interface LoginState {
  host: string;
  stage: LoginStage;
  loading: boolean;
  providers: Provider[];
  providersLoading: boolean;
  providersError: string | null;
  recentlyUsedHosts: string[];
  deviceCode: string | null;
  userCode: string | null;
  qrCode: string | null;
  qrPolling: boolean;
  shouldPlayLogo: boolean;
  loadingProviderId: string | null; // Track which provider is currently loading
  isQRExpired: boolean;
  qrTerminalError: "expired" | "access_denied" | "server_down" | null;
  /** Human-readable reason the QR/device code could not be generated, if any */
  qrError: string | null;
}

export interface LoginActions {
  setHost: (host: string) => void;
  setStage: (stage: LoginStage) => void;
  setLoading: (loading: boolean) => void;
  setProviders: (providers: Provider[]) => void;
  setRecentlyUsedHosts: (hosts: string[]) => void;
  setDeviceCode: (code: string | null) => void;
  setUserCode: (code: string | null) => void;
  setQrCode: (code: string | null) => void;
  setQrPolling: (polling: boolean) => void;
  setShouldPlayLogo: (should: boolean) => void;
  setLoadingProviderId: (id: string | null) => void;
  setIsQRExpired: (expired: boolean) => void;
  setQrTerminalError: (
    error: "expired" | "access_denied" | "server_down" | null,
  ) => void;
  /** Retry device-code generation after a failure (re-runs the init flow) */
  retryQR: () => void;
  refreshQRCode: () => void;
  selectRecentHost: (host: string) => void;
  removeFromRecentlyUsed: (host: string) => void;
  tryConnect: () => Promise<boolean>;
  reloadProviders: () => Promise<void>;
  signInWithProvider: (providerId: string) => Promise<void>;
}

export interface LoginHandlers {
  loadRecentlyUsedHosts: () => Promise<void>;
  saveRecentlyUsedHosts: (hosts: string[]) => Promise<void>;
  addToRecentlyUsed: (host: string) => Promise<void>;
}
