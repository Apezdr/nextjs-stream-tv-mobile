// Detects adaptive (HLS/DASH) stream sources by URL extension. The app never
// sets `contentType` on video sources — streams arrive as bare .m3u8/.mpd
// URLs — so the extension is the only available signal (it is also what iOS
// itself uses to decide a source is HLS).
export function isAdaptiveStreamURL(url: string | null | undefined): boolean {
  if (!url) return false;
  const path = url.split(/[?#]/, 1)[0].toLowerCase();
  return path.endsWith(".m3u8") || path.endsWith(".mpd");
}
