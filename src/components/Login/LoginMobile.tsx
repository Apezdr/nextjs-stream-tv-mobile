import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import ChooseStage from "./components/ChooseStage";
import EnterStage from "./components/EnterStage";
import SessionExpiredNotice from "./components/SessionExpiredNotice";
import { useLoginLogic } from "./hooks/useLoginLogic";
import {
  createSharedStyles,
  createMobileProviderStyles,
} from "./styles/sharedStyles";

import MobileButton from "@/src/components/basic/Mobile/Parts/Button";
import MobileTextInput from "@/src/components/basic/Mobile/Parts/Input";

export default function LoginMobile() {
  const { ready, user, state, actions, goBackToEnter, sessionExpired } =
    useLoginLogic();

  const { stage } = state;

  // Create styles
  const sharedStyles = createSharedStyles(false); // false for mobile platform
  const mobileProviderStyles = createMobileProviderStyles();
  const styles = { ...sharedStyles, ...mobileProviderStyles };

  // ── 1) still loading your rehydration?
  if (!ready) {
    return <ActivityIndicator style={styles.centered} />;
  }

  // ── 2) already signed in?
  if (user) {
    return <Redirect href="/" withAnchor />;
  }

  // ── 3) ask for host
  if (stage === "enter") {
    return (
      <View style={loginMobileStyles.stageWrapper}>
        <SessionExpiredNotice visible={sessionExpired} />
        <EnterStage
          state={state}
          actions={actions}
          isTVPlatform={false}
          styles={styles}
          Container={View}
          TextInput={MobileTextInput}
          Button={MobileButton}
        />
      </View>
    );
  }

  // ── 4) show SSO options
  if (stage === "choose") {
    return (
      <View style={loginMobileStyles.stageWrapper}>
        <SessionExpiredNotice visible={sessionExpired} />
        <ChooseStage
          state={state}
          isTVPlatform={false}
          styles={styles}
          signInWithProvider={actions.signInWithProvider}
          goBackToEnter={goBackToEnter}
          reloadProviders={actions.reloadProviders}
          Container={View}
          Button={MobileButton}
        />
      </View>
    );
  }

  // Mobile doesn't support QR stage - users only get provider options

  return null;
}

const loginMobileStyles = StyleSheet.create({
  // Plain flex passthrough so the notice can sit above the stage without
  // constraining the stage's own layout (the shared `centered` style would).
  stageWrapper: { flex: 1 },
});
