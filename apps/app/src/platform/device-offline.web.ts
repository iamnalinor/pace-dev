import { useEffect, useState } from "react";

/**
Whether the browser says it has no network at all (`navigator.onLine` false is certain; true
only means some network). On the way back `onBackOnline` runs, so the sync and the live socket
start again at once instead of at the next poll (half a minute or more, with backoff).
*/
export const useIsDeviceOffline = (onBackOnline: () => void): boolean => {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    const onOffline = (): void => {
      setIsOffline(true);
    };
    const onOnline = (): void => {
      setIsOffline(false);
      onBackOnline();
    };
    globalThis.addEventListener("offline", onOffline);
    globalThis.addEventListener("online", onOnline);
    return () => {
      globalThis.removeEventListener("offline", onOffline);
      globalThis.removeEventListener("online", onOnline);
    };
  }, [onBackOnline]);
  return isOffline;
};
