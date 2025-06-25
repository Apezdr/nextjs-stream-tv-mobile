import { Redirect } from "expo-router";

export default function ProtectedIndexRedirect() {
  // Redirect to the browse index page
  return <Redirect href="./(browse)" />;
}
