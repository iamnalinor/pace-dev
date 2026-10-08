import { useEffect, useState } from "react";

import { isOnboarded } from "#app/platform/onboarding.ts";

/** Whether this phone went through the permissions walk-through; `null` while it is read. */
export const useOnboarded = (): boolean | null => {
  const [isDone, setIsDone] = useState<boolean | null>(null);
  useEffect(() => {
    const lifetime = new AbortController();
    void (async () => {
      const hasOnboarded = await isOnboarded();
      if (!lifetime.signal.aborted) {
        setIsDone(hasOnboarded);
      }
    })();
    return () => {
      lifetime.abort();
    };
  }, []);
  return isDone;
};
