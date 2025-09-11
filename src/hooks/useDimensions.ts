import { useState, useEffect } from "react";
import { Dimensions, ScaledSize } from "react-native";

interface DimensionsState {
  window: {
    width: number;
    height: number;
  };
  screen: {
    width: number;
    height: number;
  };
}

/**
 * Hook to track and respond to dimension changes (e.g., device rotation)
 * @returns Current window and screen dimensions that update when orientation changes
 */
export function useDimensions() {
  // Initialize with current dimensions
  const [dimensions, setDimensions] = useState<DimensionsState>({
    window: Dimensions.get("window"),
    screen: Dimensions.get("screen"),
  });

  useEffect(() => {
    // Handler function to update dimensions when changes occur
    const onChange = ({
      window,
      screen,
    }: {
      window: ScaledSize;
      screen: ScaledSize;
    }) => {
      setDimensions({
        window,
        screen,
      });
    };

    // Add event listener for dimension changes (e.g., rotation)
    const subscription = Dimensions.addEventListener("change", onChange);

    // Cleanup function to remove event listener
    return () => subscription.remove();
  }, []);

  return dimensions;
}
