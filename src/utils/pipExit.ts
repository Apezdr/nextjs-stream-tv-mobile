import type { AppStateStatus } from "react-native";

/**
 * Tells the two ways picture-in-picture can end apart.
 *
 * Both arrive as the same `onPictureInPictureStop` event:
 *
 * - EXPANDED back into the app: the Activity resumes, so AppState is (or
 *   within a beat becomes) "active". Playback must carry on.
 * - DISMISSED with the close button: the Activity stays stopped and AppState
 *   remains "background". Playback must pause — nothing native pauses an
 *   auto-enter PiP view (expo-video deliberately leaves the PiP candidate
 *   playing when the app backgrounds), so without this the audio would keep
 *   running under the launcher with no way to stop it.
 *
 * The verdict is "expanded" at once when AppState is already active.
 * Otherwise the stop is called a DISMISSAL immediately — the player pauses
 * — and if the resume that follows an expand arrives within `graceMs`
 * (wall-clock), a second verdict "expanded" asks for playback back. The
 * expand case therefore pauses for a few hundred milliseconds; the earlier
 * design waited that long on a JS timer before deciding, but Android freezes
 * JavaScript timers while the Activity is stopped, so a dismissal's timer
 * never fired and the audio played on. Wall-clock comparisons need no timer.
 * One arbiter per screen; call `cancel()` on unmount.
 */
export type PipExitOutcome = "expanded" | "dismissed";

export interface PipExitArbiter {
  /** Feed from `onPictureInPictureStop` with `AppState.currentState`. */
  onPipStop(appState: AppStateStatus): void;
  /** Feed from the AppState "change" listener. */
  onAppStateChange(appState: AppStateStatus): void;
  /** Forget a stop whose expand window is still open (unmount). */
  cancel(): void;
  /** True while a dismissed stop could still turn out to be an expand. */
  readonly pending: boolean;
}

export function createPipExitArbiter(options: {
  graceMs: number;
  onOutcome: (outcome: PipExitOutcome) => void;
  /** Injectable clock for tests. */
  now?: () => number;
}): PipExitArbiter {
  const now = options.now ?? (() => Date.now());
  // Wall-clock of the last stop that was called a dismissal, or null once
  // its expand window has closed or been consumed.
  let dismissedAt: number | null = null;

  const windowOpen = () =>
    dismissedAt !== null && now() - dismissedAt <= options.graceMs;

  return {
    get pending() {
      return windowOpen();
    },
    onPipStop(appState) {
      dismissedAt = null;
      if (appState === "active") {
        options.onOutcome("expanded");
        return;
      }
      dismissedAt = now();
      options.onOutcome("dismissed");
    },
    onAppStateChange(appState) {
      if (appState !== "active") return;
      if (windowOpen()) {
        dismissedAt = null;
        options.onOutcome("expanded");
      } else {
        dismissedAt = null;
      }
    },
    cancel() {
      dismissedAt = null;
    },
  };
}
