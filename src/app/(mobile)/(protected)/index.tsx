import { Redirect } from "expo-router";

export default function MobileProtectedIndex() {
  // Redirect to the tabs layout for mobile
  return <Redirect href="./(tabs)" />;
}
