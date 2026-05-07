import { useRouter, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { TVFocusGuideView, Platform } from "react-native";

import FocusableButton from "@/src/components/basic/TV/Parts/Button";
import FocusableTextInput from "@/src/components/basic/TV/Parts/Input";
import EnterStage from "@/src/components/Login/components/EnterStage";
import { useLoginLogic } from "@/src/components/Login/hooks/useLoginLogic";
import {
  createSharedStyles,
  createTVFocusStyles,
} from "@/src/components/Login/styles/sharedStyles";
import { useBackdropManager } from "@/src/hooks/useBackdrop";

export default function EnterScreen() {
  const router = useRouter();
  const { state, actions } = useLoginLogic();
  const { hide: hideBackdrop } = useBackdropManager();

  const sharedStyles = createSharedStyles(true);
  const tvFocusStyles = createTVFocusStyles();
  const styles = { ...sharedStyles, ...tvFocusStyles };

  // Hide backdrop when entering the site input screen
  useFocusEffect(
    useCallback(() => {
      hideBackdrop({ fade: true, duration: 300 });
    }, [hideBackdrop]),
  );

  // Override tryConnect to navigate to the appropriate screen based on platform
  const enhancedTryConnect = useCallback(async () => {
    const success = await actions.tryConnect();
    if (success) {
      // On TV, go directly to QR; on mobile, go to provider choice
      const targetRoute = Platform.isTV ? "/login/qr" : "/login/choose";
      router.push(targetRoute);
    }
  }, [actions, router]);

  return (
    <EnterStage
      state={state}
      actions={{ ...actions, tryConnect: enhancedTryConnect }}
      isTVPlatform={true}
      styles={styles}
      Container={TVFocusGuideView}
      TextInput={FocusableTextInput}
      Button={FocusableButton}
    />
  );
}
