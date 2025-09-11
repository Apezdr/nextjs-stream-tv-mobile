import { Ionicons } from "@expo/vector-icons";
import { useCallback } from "react";

import { ActionSheetAction } from "@/src/components/Mobile/ActionSheet/MobileActionSheet";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { navigationHelper } from "@/src/utils/navigationHelper";

export interface ActionSheetContentData {
  id: string;
  title: string;
  mediaType: "movie" | "tv";
  seasonNumber?: number;
  episodeNumber?: number;
  backdrop?: string;
  backdropBlurhash?: string;
}

export interface ActionSheetCallbacks {
  onClose: () => void;
  onPlay?: (contentData: ActionSheetContentData) => void;
  onRestart?: (contentData: ActionSheetContentData) => void;
  onInfo?: (contentData: ActionSheetContentData) => void;
}

export type ActionSheetContext = "episode" | "movie" | "show" | "card";

export interface ActionSheetConfig {
  actions: ActionSheetAction[];
  title: string;
  subtitle?: string;
}

export const useActionSheetConfig = () => {
  const { show: showBackdrop } = useBackdropManager();

  const generateConfig = useCallback(
    (
      contentData: ActionSheetContentData,
      context: ActionSheetContext,
      callbacks: ActionSheetCallbacks,
    ): ActionSheetConfig => {
      const { onClose, onPlay, onRestart, onInfo } = callbacks;

      // Default handlers that use navigationHelper (not using useCallback inside)
      const defaultHandlePlay = () => {
        if (contentData.backdrop) {
          showBackdrop(contentData.backdrop, {
            fade: true,
            duration: 300,
            blurhash: contentData.backdropBlurhash,
          });
        }

        navigationHelper.navigateToWatch({
          id: contentData.id,
          type: contentData.mediaType,
          season: contentData.seasonNumber,
          episode: contentData.episodeNumber,
          backdrop: contentData.backdrop,
          backdropBlurhash: contentData.backdropBlurhash,
        });
      };

      const defaultHandleRestart = () => {
        if (contentData.backdrop) {
          showBackdrop(contentData.backdrop, {
            fade: true,
            duration: 300,
            blurhash: contentData.backdropBlurhash,
          });
        }

        navigationHelper.navigateToWatch({
          id: contentData.id,
          type: contentData.mediaType,
          season: contentData.seasonNumber,
          episode: contentData.episodeNumber,
          backdrop: contentData.backdrop,
          backdropBlurhash: contentData.backdropBlurhash,
          restart: "true", // Use string to match URL parameter format
        });
      };

      const defaultHandleInfo = () => {
        if (contentData.backdrop) {
          showBackdrop(contentData.backdrop, {
            fade: true,
            duration: 300,
            blurhash: contentData.backdropBlurhash,
          });
        }

        if (
          contentData.mediaType === "tv" &&
          contentData.seasonNumber &&
          contentData.episodeNumber
        ) {
          // Navigate to episode info
          navigationHelper.navigateToEpisodeInfo({
            showId: contentData.id,
            season: contentData.seasonNumber,
            episode: contentData.episodeNumber,
          });
        } else {
          // Navigate to media info
          navigationHelper.navigateToMediaInfo({
            id: contentData.id,
            type: contentData.mediaType,
            backdrop: contentData.backdrop,
            backdropBlurhash: contentData.backdropBlurhash,
          });
        }
      };

      // Use provided callbacks or defaults
      const handlePlay = onPlay ? () => onPlay(contentData) : defaultHandlePlay;
      const handleRestart = onRestart
        ? () => onRestart(contentData)
        : defaultHandleRestart;
      const handleInfo = onInfo ? () => onInfo(contentData) : defaultHandleInfo;

      const createAction = (
        id: string,
        title: string,
        icon: keyof typeof Ionicons.glyphMap,
        variant: "default" | "primary" | "destructive",
        handler: () => void,
      ): ActionSheetAction => ({
        id,
        title,
        icon,
        variant,
        onPress: () => {
          onClose();
          handler();
        },
      });

      // Generate actions based on context
      switch (context) {
        case "episode": {
          // TV Episode: Play → Restart → Episode Info
          const actions: ActionSheetAction[] = [
            createAction("play", "Play Episode", "play", "primary", handlePlay),
            createAction(
              "restart",
              "Restart From Beginning",
              "refresh",
              "default",
              handleRestart,
            ),
            createAction(
              "info",
              "Episode Info",
              "information-circle",
              "default",
              handleInfo,
            ),
          ];

          return {
            actions,
            title: `Episode ${contentData.episodeNumber}`,
            subtitle: contentData.title,
          };
        }

        case "movie": {
          // Movie: Play → Restart → Movie Info
          const actions: ActionSheetAction[] = [
            createAction("play", "Play Movie", "play", "primary", handlePlay),
            createAction(
              "restart",
              "Restart From Beginning",
              "refresh",
              "default",
              handleRestart,
            ),
            createAction(
              "info",
              "Movie Info",
              "information-circle",
              "default",
              handleInfo,
            ),
          ];

          return {
            actions,
            title: contentData.title,
            subtitle: "Movie Options",
          };
        }

        case "show": {
          // TV Show (general): Show Info only
          const actions: ActionSheetAction[] = [
            createAction(
              "info",
              "View Seasons and Episodes",
              "information-circle",
              "default",
              handleInfo,
            ),
          ];

          return {
            actions,
            title: contentData.title,
            subtitle: "View Seasons and Episodes",
          };
        }

        case "card": {
          // Content Card: Dynamic actions based on content type
          const isEpisode =
            contentData.mediaType === "tv" &&
            contentData.seasonNumber &&
            contentData.episodeNumber;
          const isMovie = contentData.mediaType === "movie";
          const isShow = contentData.mediaType === "tv" && !isEpisode;

          // For TV shows without specific season/episode, only show "View Seasons and Episodes"
          if (isShow) {
            const actions: ActionSheetAction[] = [
              createAction(
                "info",
                "View Seasons and Episodes",
                "list",
                "default",
                handleInfo,
              ),
            ];

            return {
              actions,
              title: contentData.title,
              subtitle: "TV Show",
            };
          }

          // For movies and episodes, show full actions
          const playTitle = isMovie ? "Play Movie" : "Play";
          const infoTitle = isEpisode ? "Episode Info" : "Movie Info";

          const actions: ActionSheetAction[] = [
            createAction("play", playTitle, "play", "primary", handlePlay),
            createAction(
              "restart",
              "Restart From Beginning",
              "refresh",
              "default",
              handleRestart,
            ),
            createAction(
              "info",
              infoTitle,
              "information-circle",
              "default",
              handleInfo,
            ),
          ];

          const subtitle = isEpisode
            ? `S${contentData.seasonNumber}E${contentData.episodeNumber}`
            : "Movie";

          return {
            actions,
            title: contentData.title,
            subtitle,
          };
        }

        default: {
          // Fallback configuration
          return {
            actions: [
              createAction(
                "info",
                "Info",
                "information-circle",
                "default",
                handleInfo,
              ),
            ],
            title: contentData.title,
            subtitle: "Options",
          };
        }
      }
    },
    [showBackdrop],
  );

  return { generateConfig };
};
