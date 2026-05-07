import { useLocalSearchParams } from "expo-router";
import MoviesPageContent from "@/src/components/TV/Pages/Movies/MoviesPageContent";

export default function MoviesPage() {
  const { viewMode } = useLocalSearchParams<{ viewMode?: "all" | "genres" }>();
  const initialViewMode = viewMode === "genres" ? "genres" : "all";

  return <MoviesPageContent initialViewMode={initialViewMode} />;
}
