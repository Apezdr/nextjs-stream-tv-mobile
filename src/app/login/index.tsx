import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import Login from "@/src/components/Login/Login";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    // For TV, navigate directly to the enter screen
    if (Platform.isTV) {
      router.replace("/login/enter");
    }
  }, [router]);

  // Mobile shows the Login component
  return <Login />;
}
