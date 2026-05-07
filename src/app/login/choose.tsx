import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { Animated, TVFocusGuideView } from "react-native";

import FocusableButton from "@/src/components/basic/TV/Parts/Button";
import ChooseStage from "@/src/components/Login/components/ChooseStage";
import { useLoginLogic } from "@/src/components/Login/hooks/useLoginLogic";
import {
  createSharedStyles,
  createTVFocusStyles,
} from "@/src/components/Login/styles/sharedStyles";

export default function ChooseScreen() {
  const router = useRouter();
  const { state, actions, user, ready } = useLoginLogic("choose");

  const sharedStyles = createSharedStyles(true);
  const tvFocusStyles = createTVFocusStyles();
  const styles = { ...sharedStyles, ...tvFocusStyles };

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const exitStarted = useRef(false);

  // Reset on focus
  useFocusEffect(
    useCallback(() => {
      fadeAnim.setValue(1);
      exitStarted.current = false;
    }, [fadeAnim]),
  );

  // Fade out then navigate when user authenticates
  useEffect(() => {
    if (ready && user && !exitStarted.current) {
      exitStarted.current = true;
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        router.replace("/");
      });
    }
  }, [ready, user, router, fadeAnim]);

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <ChooseStage
        state={state}
        isTVPlatform={true}
        styles={styles}
        signInWithProvider={actions.signInWithProvider}
        goBackToEnter={() => router.back()}
        goToQRStage={() => router.push("/login/qr")}
        Container={TVFocusGuideView}
        Button={FocusableButton}
      />
    </Animated.View>
  );
}
