import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";

// Define the sidebar states
export type SidebarState = "closed" | "minimized" | "expanded";

// Define the context type
interface TVNavigationContextType {
  sidebarState: SidebarState;
  setSidebarState: (state: SidebarState) => void;
  toggleSidebar: () => void;
  expandSidebar: () => void;
  collapseSidebar: () => void;
  closeSidebar: () => void;
  isSidebarVisible: boolean;
  isVideoFullscreen: boolean;
  setIsVideoFullscreen: (isFullscreen: boolean) => void;
}

// Create the context
const TVNavigationContext = createContext<TVNavigationContextType | null>(null);

// Hook for using the context
export const useTVNavigation = () => {
  const context = useContext(TVNavigationContext);
  if (!context) {
    throw new Error(
      "useTVNavigation must be used within a TVNavigationProvider",
    );
  }
  return context;
};

// Provider component
interface TVNavigationProviderProps {
  children: ReactNode;
}

export const TVNavigationProvider: React.FC<TVNavigationProviderProps> = ({
  children,
}) => {
  // State for the sidebar - initialize as minimized so it's visible by default
  const [sidebarState, setSidebarState] = useState<SidebarState>("minimized");

  // Track if video is in fullscreen mode
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);

  // Check if sidebar is visible in any state
  const isSidebarVisible = sidebarState !== "closed";

  // Auto-close sidebar when video goes fullscreen
  useEffect(() => {
    if (isVideoFullscreen && sidebarState !== "closed") {
      setSidebarState("closed");
    }
  }, [isVideoFullscreen, sidebarState]);

  // Toggle between minimized and expanded
  const toggleSidebar = useCallback(() => {
    setSidebarState((prev) => {
      if (prev === "closed") return "minimized";
      if (prev === "minimized") return "expanded";
      return "minimized"; // If expanded, go back to minimized
    });
  }, []);

  // Expand the sidebar
  const expandSidebar = useCallback(() => {
    setSidebarState("expanded");
  }, []);

  // Collapse to minimized state
  const collapseSidebar = useCallback(() => {
    setSidebarState("minimized");
  }, []);

  // Close the sidebar completely
  const closeSidebar = useCallback(() => {
    setSidebarState("closed");
  }, []);

  // Context value
  const value = {
    sidebarState,
    setSidebarState,
    toggleSidebar,
    expandSidebar,
    collapseSidebar,
    closeSidebar,
    isSidebarVisible,
    isVideoFullscreen,
    setIsVideoFullscreen,
  };

  return (
    <TVNavigationContext.Provider value={value}>
      {children}
    </TVNavigationContext.Provider>
  );
};
