import type { AppStateStatus } from "react-native";

/**
 * Tells the two ways picture-in-picture can end apart.
 *
 * Both arrive as the same `onPictureInPictureStop` event:
 *
 * - EXPANDED back into the app: the Activity resumes, so AppState is (or
 *   within a beat becomes) "active". Playback must simply carry on.
 * - DISMISSED with the close button: the Activity stays stopped and AppState
 *   remains "background". Playback must pause — nothing native pauses an
 *   auto-enter PiP view (expo-video deliberately leaves the PiP candidate
 *   playing when the app backgrounds), so without this the audio would keep
 *   running under the launcher.
 *
 * The verdict is "expanded" at once when AppState is already active, else
 * the arbiter waits up to `graceMs` for the resume that follows an expand
 * before calling the stop a dismissal. One arbiter per screen; call
 * `cancel()` on unmount.
 */
export type PipExitOutcome = "expanded" | "dismissed";

export interface PipExitArbiter {
  /** Feed from `onPictureInPictureStop` with `AppState.currentState`. */
  onPipStop(appState: AppStateStatus): void;
  /** Feed from the AppState "change" listener. */
  onAppStateChange(appState: AppStateStatus): void;
  /** Drop a pending verdict (unmount). */
  cancel(): void;
  /** True while a PiP stop is waiting for the grace window. */
  readonly pending: boolean;
}

export function createPipExitArbiter(options: {
  graceMs: number;
  onOutcome: (outcome: PipExitOutcome) => void;
}): PipExitArbiter {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    get pending() {
      return timer !== null;
    },
    onPipStop(appState) {
      clear();
      if (appState === "active") {
        options.onOutcome("expanded");
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        options.onOutcome("dismissed");
      }, options.graceMs);
    },
    onAppStateChange(appState) {
      if (timer !== null && appState === "active") {
        clear();
        options.onOutcome("expanded");
      }
    },
    cancel: clear,
  };
}
