// Shared types for Login components
export interface Provider {
  id: string;
  name: string;
}

export type LoginStage = "enter" | "choose" | "qr";

export interface LoginState {
  host: string;
  stage: LoginStage;
  loading: boolean;
  providers: Provider[];
  recentlyUsedHosts: string[];
  qrSessionId: string | null;
  qrCode: string | null;
  qrPolling: boolean;
  shouldPlayLogo: boolean;
  loadingProviderId: string | null; // Track which provider is currently loading
}

export interface LoginActions {
  setHost: (host: string) => void;
  setStage: (stage: LoginStage) => void;
  setLoading: (loading: boolean) => void;
  setProviders: (providers: Provider[]) => void;
  setRecentlyUsedHosts: (hosts: string[]) => void;
  setQrSessionId: (id: string | null) => void;
  setQrCode: (code: string | null) => void;
  setQrPolling: (polling: boolean) => void;
  setShouldPlayLogo: (should: boolean) => void;
  setLoadingProviderId: (id: string | null) => void;
  selectRecentHost: (host: string) => void;
  removeFromRecentlyUsed: (host: string) => void;
  tryConnect: () => Promise<void>;
  signInWithProvider: (providerId: string) => Promise<void>;
}

export interface LoginHandlers {
  loadRecentlyUsedHosts: () => Promise<void>;
  saveRecentlyUsedHosts: (hosts: string[]) => Promise<void>;
  addToRecentlyUsed: (host: string) => Promise<void>;
}
