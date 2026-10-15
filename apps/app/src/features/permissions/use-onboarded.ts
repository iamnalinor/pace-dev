import { useEffect, useState } from "react";

import { onOnboarded } from "#app/platform/onboarding-store.ts";
import { isOnboarded } from "#app/platform/onboarding.ts";

/**
Whether this phone went through the permissions walk-through; `null` while it is read. It turns
true while mounted when the walk-through ends (`markOnboarded`), not only on the next launch.
*/
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
    const stopListening = onOnboarded(() => {
      // A read still in flight may carry the old answer: the news wins.
      lifetime.abort();
      setIsDone(true);
    });
    return () => {
      lifetime.abort();
      stopListening();
    };
  }, []);
  return isDone;
};
