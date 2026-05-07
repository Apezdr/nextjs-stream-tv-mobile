import { useLocalSearchParams } from "expo-router";

import TVShowsPageContent from "@/src/components/TV/Pages/TVShows/TVShowsPageContent";

export default function TVShowsPage() {
  const { viewMode } = useLocalSearchParams<{ viewMode?: "all" | "genres" }>();
  const initialViewMode = viewMode === "genres" ? "genres" : "all";

  return <TVShowsPageContent initialViewMode={initialViewMode} />;
}
