// Main Login component with platform-based conditional rendering
import LoginMobile from "./LoginMobile";
import LoginTV from "./LoginTV";

import { getDeviceType } from "@/src/utils/deviceInfo";

export default function Login() {
  const isTVPlatform = getDeviceType() === "tv";

  if (isTVPlatform) {
    return <LoginTV />;
  }

  return <LoginMobile />;
}
