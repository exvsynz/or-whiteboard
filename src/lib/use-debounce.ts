import { useCallback, useEffect, useRef } from "react";

export function useDebouncedCallback<
  T extends (...args: Parameters<T>) => void,
>(callback: T, delay: number): T {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the callback ref current so the debounced version always calls
  // the latest closure without resetting the timer.
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Clear any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        callbackRef.current(...args);
        timerRef.current = null;
      }, delay);
    },
    [delay],
  ) as T;

  return debounced;
}
