import { useMemo } from "react";

import type { MediaDetailsResponse } from "@/src/data/types/content.types";
import { useQualityPreferencesStore } from "@/src/stores/qualityPreferencesStore";
import { PlatformClass, getPlatformClass } from "@/src/utils/deviceInfo";
import type { StreamVideoRange } from "@/src/utils/streamUrls";
import { getDisplayHdrTypes } from "@/src/utils/videoDiagnostics";
import { resolveVideoRange } from "@/src/utils/videoRange";

/**
 * The `range` to request for a title's ABR masters, from the media payload
 * (`streamFeatures`, `mediaQuality.transferCharacteristics`, `dimensions`),
 * the display's HDR types and the "HDR and 4K Auto" preference. Null means
 * today's unfiltered master. Plain function for non-hook callers (the TV
 * episode switch resolves it for the next episode's payload).
 */
export function videoRangeFor(
  data: MediaDetailsResponse | null | undefined,
  enabled: boolean,
  platformClass: PlatformClass = getPlatformClass(),
): StreamVideoRange | null {
  return resolveVideoRange({
    enabled,
    streamFeatures: data?.streamFeatures ?? null,
    transferCharacteristics:
      data?.mediaQuality?.transferCharacteristics ?? null,
    dimensions: data?.dimensions ?? null,
    platformClass,
    displayHdrTypes: getDisplayHdrTypes(),
  });
}

export function useVideoRange(
  data: MediaDetailsResponse | null | undefined,
): StreamVideoRange | null {
  const enabled = useQualityPreferencesStore((s) => s.enhancedAutoPlayback);
  const platformClass = useMemo(() => getPlatformClass(), []);
  const streamFeatures = data?.streamFeatures;
  const transfer = data?.mediaQuality?.transferCharacteristics;
  const dimensions = data?.dimensions;
  return useMemo(
    () =>
      resolveVideoRange({
        enabled,
        streamFeatures: streamFeatures ?? null,
        transferCharacteristics: transfer ?? null,
        dimensions: dimensions ?? null,
        platformClass,
        displayHdrTypes: getDisplayHdrTypes(),
      }),
    [enabled, streamFeatures, transfer, dimensions, platformClass],
  );
}
