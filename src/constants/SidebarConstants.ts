import { Dimensions } from "react-native";

// Get screen dimensions - memoized to avoid recalculation
const SCREEN_DIMENSIONS = Dimensions.get("window");

// Define sidebar widths - exported for use in other components
export const MINIMIZED_WIDTH = 60;
export const EXPANDED_WIDTH = SCREEN_DIMENSIONS.width * (2 / 6); // 2/6 of screen width
