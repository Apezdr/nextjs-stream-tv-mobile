import { BlurTargetView } from "expo-blur";
import { useFocusEffect } from "expo-router";
import { ReactNode, RefObject, useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { create } from "zustand";

/**
 * What the floating tab bar's frosted glass blurs on Android.
 *
 * expo-blur's Android blur (the dimezis method) no longer blurs whatever
 * happens to be behind it: it needs an explicit target view, and the blur
 * view must sit outside that target, so the tab navigator itself cannot be
 * the target. Each tab screen is wrapped in a target instead (the tabs
 * layout's `screenLayout`), and the focused screen registers its ref here
 * for the bar to use. On iOS the target is a plain View and the blur is
 * the system material as before.
 */
interface TabBlurTargetState {
  target: RefObject<View | null> | null;
  setTarget: (target: RefObject<View | null> | null) => void;
}

const useTabBlurTargetStore = create<TabBlurTargetState>((set) => ({
  target: null,
  setTarget: (target) => set({ target }),
}));

export function useTabBlurTarget(): RefObject<View | null> | null {
  return useTabBlurTargetStore((s) => s.target);
}

export function TabScreenBlurTarget({ children }: { children: ReactNode }) {
  const ref = useRef<View>(null);
  const setTarget = useTabBlurTargetStore((s) => s.setTarget);

  useFocusEffect(
    useCallback(() => {
      setTarget(ref);
      return () => {
        if (useTabBlurTargetStore.getState().target === ref) setTarget(null);
      };
    }, [setTarget]),
  );

  return (
    <BlurTargetView ref={ref} style={styles.fill}>
      {children}
    </BlurTargetView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
