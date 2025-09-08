import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { View, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

interface PortalItem {
  key: string;
  element: ReactNode;
}

interface PortalContextType {
  addPortal: (key: string, element: ReactNode) => void;
  removePortal: (key: string) => void;
}

const PortalContext = createContext<PortalContextType | null>(null);

export const usePortal = () => {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error("usePortal must be used within a PortalProvider");
  }
  return context;
};

export const PortalProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [portals, setPortals] = useState<PortalItem[]>([]);

  const addPortal = useCallback((key: string, element: ReactNode) => {
    setPortals((prev) => {
      // Remove any existing portal with the same key, then add the new one
      const filtered = prev.filter((p) => p.key !== key);
      return [...filtered, { key, element }];
    });
  }, []);

  const removePortal = useCallback((key: string) => {
    setPortals((prev) => prev.filter((p) => p.key !== key));
  }, []);

  return (
    <PortalContext.Provider value={{ addPortal, removePortal }}>
      {children}
      {/* Portal Container - renders at root level with gesture support */}
      <View style={styles.portalContainer} pointerEvents="box-none">
        {portals.map((portal) => (
          <GestureHandlerRootView key={portal.key} style={styles.gestureRoot}>
            {portal.element}
          </GestureHandlerRootView>
        ))}
      </View>
    </PortalContext.Provider>
  );
};

const styles = StyleSheet.create({
  portalContainer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 9999,
  },
  gestureRoot: {
    flex: 1,
  },
});
