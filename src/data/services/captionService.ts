import { getAxiosInstance } from "@/src/data/api/axiosClient";
import {
  CaptionCue,
  captionMarkupCensus,
  parseCaptionCues,
} from "@/src/utils/captionCues";

/**
 * Load a caption file's cues through the app's authenticated client.
 *
 * `captionURLs` entries point at `/api/authenticated/subtitles`, which wants
 * the session like every other authenticated route. The subtitle library
 * the player used to render through fetched the URL with its own bare axios
 * — no token, no catch — so the request failed with 401 as an uncaught
 * promise and no captions ever showed. Resolves null on any failure; the
 * caller shows no captions and the reason is in the log.
 */
export async function loadCaptionCues(
  url: string,
): Promise<CaptionCue[] | null> {
  try {
    const response = await getAxiosInstance().get<string>(url, {
      responseType: "text",
      // Keep the body as text: the client parses JSON by default and would
      // hand back whatever a VTT file happened to look like to it.
      transformResponse: [(data) => data],
      headers: { Accept: "text/vtt, text/plain, */*" },
    });
    if (typeof response.data !== "string") {
      console.warn(
        "[CaptionService] Unexpected caption body",
        typeof response.data,
      );
      return null;
    }
    const cues = parseCaptionCues(response.data);
    console.log(
      `[CaptionService] ${cues.length} cues from ${url.split("?")[0]}`,
    );
    if (__DEV__) {
      // Which inline markup real files use (dev builds only): the parser
      // styles <i>/<b>/<u>/<font>/<c.colour>/{\i1}; anything else listed
      // here is a candidate for support.
      const census = captionMarkupCensus(response.data);
      console.log(
        `[CaptionService] markup seen (${census.length}): ${census.join(" ") || "none"}`,
      );
    }
    return cues;
  } catch (error) {
    console.warn("[CaptionService] Caption load failed:", error);
    return null;
  }
}
