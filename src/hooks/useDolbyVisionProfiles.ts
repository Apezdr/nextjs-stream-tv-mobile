import { useEffect, useState } from "react";

import { probeDolbyVisionProfiles } from "@/src/utils/videoDiagnostics";

/**
 * The device's advertised Dolby Vision profiles, null until probed or when
 * unknown. Feeds the tier policy's device-side veto on `file.dvProfile`.
 */
export function useDolbyVisionProfiles(): number[] | null {
  const [profiles, setProfiles] = useState<number[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    probeDolbyVisionProfiles().then((result) => {
      if (!cancelled) setProfiles(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return profiles;
}
