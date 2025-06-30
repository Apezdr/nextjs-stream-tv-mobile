import { useState, useCallback } from "react";
import { DeviceEventEmitter } from "react-native";

export type SidebarState = "closed" | "minimized" | "expanded";

export const useSidebarState = (initialState: SidebarState = "minimized") => {
  const [sidebarState, setSidebarStateInternal] =
    useState<SidebarState>(initialState);

  // Broadcast state changes via DeviceEventEmitter for cross-component communication
  const setSidebarState = useCallback((newState: SidebarState) => {
    setSidebarStateInternal(newState);

    // Emit event for other components (like TVHomePage for layout calculations)
    DeviceEventEmitter.emit("sidebarStateChange", newState);
  }, []);

  // Sidebar control functions
  const toggleSidebar = useCallback(() => {
    setSidebarStateInternal((prev) => {
      const newState =
        prev === "closed"
          ? "minimized"
          : prev === "minimized"
            ? "expanded"
            : "minimized";

      // Emit event for the new state
      DeviceEventEmitter.emit("sidebarStateChange", newState);

      return newState;
    });
  }, []);

  const expandSidebar = useCallback(() => {
    setSidebarState("expanded");
  }, [setSidebarState]);

  const collapseSidebar = useCallback(() => {
    setSidebarState("minimized");
  }, [setSidebarState]);

  const closeSidebar = useCallback(() => {
    setSidebarState("closed");
  }, [setSidebarState]);

  return {
    sidebarState,
    setSidebarState,
    toggleSidebar,
    expandSidebar,
    collapseSidebar,
    closeSidebar,
    isSidebarVisible: sidebarState !== "closed",
  };
};
