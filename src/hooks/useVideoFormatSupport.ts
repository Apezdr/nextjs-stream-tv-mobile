import { useEffect, useMemo, useState } from "react";

import type { DirectPlayInfo } from "@/src/data/types/directPlay.types";
import {
  VideoFormatSupport,
  probeVideoFormatSupport,
} from "@/src/utils/videoDiagnostics";
import {
  VideoFormatSpec,
  videoFormatKey,
  videoFormatOf,
} from "@/src/utils/videoFormat";

export interface VideoFormatSupportAnswers {
  /** undefined = asked, no answer yet; "unknown" = could not be asked. */
  file?: VideoFormatSupport;
  original?: VideoFormatSupport;
}

/**
 * What this device's decoder says about the title's raw file and Original
 * rung, for the tier policy's device-side vetoes. Asks once per distinct
 * format (the probe is cached) and answers "unknown" at once when the
 * verdict carries nothing to ask about, so the policy never waits on a
 * question that cannot be posed.
 */
export function useVideoFormatSupport(
  info: DirectPlayInfo | null | undefined,
): VideoFormatSupportAnswers {
  const specs = useMemo(() => videoFormatOf(info), [info]);
  const fileKey = specs.file ? videoFormatKey(specs.file) : null;
  const originalKey = specs.original ? videoFormatKey(specs.original) : null;
  const [answers, setAnswers] = useState<Record<string, VideoFormatSupport>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    const ask = (spec: VideoFormatSpec | null, key: string | null) => {
      if (!spec || !key) return;
      probeVideoFormatSupport(spec).then((support) => {
        if (cancelled) return;
        setAnswers((prev) =>
          prev[key] === support ? prev : { ...prev, [key]: support },
        );
      });
    };
    ask(specs.file, fileKey);
    ask(specs.original, originalKey);
    return () => {
      cancelled = true;
    };
  }, [specs, fileKey, originalKey]);

  return useMemo(
    () => ({
      file: fileKey ? answers[fileKey] : "unknown",
      original: originalKey ? answers[originalKey] : "unknown",
    }),
    [answers, fileKey, originalKey],
  );
}
