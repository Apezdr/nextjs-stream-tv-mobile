/**
 * Custom hook for debounced prefetching to handle fast scrolling
 */
import { useCallback, useRef } from "react";

interface UseDebouncedPrefetchOptions {
  delay?: number; // Debounce delay in milliseconds
  immediate?: boolean; // Execute immediately on first call
}

export function useDebouncedPrefetch(
  callback: () => void,
  options: UseDebouncedPrefetchOptions = {},
) {
  const { delay = 150, immediate = false } = options;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const immediateRef = useRef(immediate);

  const debouncedCallback = useCallback(() => {
    const callNow = immediateRef.current && !timeoutRef.current;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      if (!immediateRef.current) {
        callback();
      }
    }, delay);

    if (callNow) {
      callback();
    }
  }, [callback, delay]);

  // Cleanup timeout on unmount
  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return { debouncedCallback, cleanup };
}
