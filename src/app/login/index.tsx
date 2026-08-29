import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import Login from "@/src/components/Login/Login";
import { useAuth } from "@/src/providers/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { ready, server } = useAuth();

  useEffect(() => {
    if (!Platform.isTV) return;
    // Wait for rehydration, otherwise `server` is still null on a cold start
    // and every returning user would be sent to the host-entry screen.
    if (!ready) return;

    // A server we already know is all the QR flow needs, so skip straight to
    // it. This is the path a forced sign-out takes: the session is gone but
    // the host isn't, and making someone re-type their server on a TV remote
    // to recover from a server-side revocation is punishing.
    router.replace(server ? "/login/qr" : "/login/enter");
  }, [router, ready, server]);

  // Mobile shows the Login component
  return <Login />;
}
