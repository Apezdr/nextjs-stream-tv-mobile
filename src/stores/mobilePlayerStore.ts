import { create } from "zustand";

/**
 * The mobile app's one playback session and how it is presented.
 *
 * Playback no longer lives on a stack screen: a host above the navigator
 * (MobilePlayerHost in the (mobile) layout) renders the session, so the
 * video keeps playing while the user browses. Three in-app presentations:
 *
 * - `watch`: the watch page — video at the top, details beneath.
 * - `fullscreen`: the details are moved away; the video has the screen.
 *   Every landscape presentation but `mini` looks like this.
 * - `mini`: a small floating player above the tab bar.
 *
 * Android picture-in-picture is a platform hand-off, not a presentation:
 * the session tracks it separately and the in-app presentation it left is
 * the one it comes back to.
 */
export type MobilePlayerPresentation = "watch" | "fullscreen" | "mini";

export interface MobilePlayerOpenParams {
  id: string;
  type: "tv" | "movie";
  season?: number;
  episode?: number;
  backdrop?: string;
  backdropBlurhash?: string;
  /** Start from the beginning even when the history has a position. */
  restart?: boolean;
}

export interface MobilePlayerSession extends MobilePlayerOpenParams {
  /** Remount key: a new one for every title or episode opened. */
  key: string;
}

interface MobilePlayerState {
  session: MobilePlayerSession | null;
  presentation: MobilePlayerPresentation;
  /**
   * Open a title. The same title and episode already playing is simply
   * brought back to the watch page (unless a restart is asked for); anything
   * else replaces the session, and the host remounts it.
   */
  open: (params: MobilePlayerOpenParams) => void;
  /** Play another episode of the session's show, keeping the presentation. */
  switchEpisode: (season: number, episode: number, restart?: boolean) => void;
  setPresentation: (presentation: MobilePlayerPresentation) => void;
  close: () => void;
}

let sessionCounter = 0;

function makeSession(params: MobilePlayerOpenParams): MobilePlayerSession {
  sessionCounter += 1;
  return {
    ...params,
    key: `${params.type}:${params.id}:${params.season ?? ""}:${params.episode ?? ""}:${sessionCounter}`,
  };
}

function sameTitle(
  a: MobilePlayerOpenParams,
  b: MobilePlayerOpenParams,
): boolean {
  return (
    a.id === b.id &&
    a.type === b.type &&
    (a.type !== "tv" || (a.season === b.season && a.episode === b.episode))
  );
}

export const useMobilePlayerStore = create<MobilePlayerState>((set, get) => ({
  session: null,
  presentation: "watch",

  open: (params) => {
    const { session } = get();
    if (session && !params.restart && sameTitle(session, params)) {
      set({ presentation: "watch" });
      return;
    }
    set({ session: makeSession(params), presentation: "watch" });
  },

  switchEpisode: (season, episode, restart = false) => {
    const { session } = get();
    if (!session || session.type !== "tv") return;
    if (!restart && session.season === season && session.episode === episode) {
      return;
    }
    set({
      session: makeSession({ ...session, season, episode, restart }),
    });
  },

  setPresentation: (presentation) => {
    if (get().presentation !== presentation) set({ presentation });
  },

  close: () => set({ session: null, presentation: "watch" }),
}));
