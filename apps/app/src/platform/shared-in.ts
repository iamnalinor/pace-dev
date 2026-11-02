import { useShareIntentContext } from "expo-share-intent";
import { useEffect, useState } from "react";

import { sharedLine } from "./shared-line.ts";

/**
What another app shared into Pace (Android's share sheet), as one composer line.

The share is taken once: the line keeps it while the provider (above the route gate) forgets it,
so the Add tab mounting again after a log-out and back in, or after the versions screen gives way,
does not fill the line with a share already added (the web's rule, review m11; sweep of QA round
17 round-3 review C1, bug class 36).
*/
export const useSharedIn = (): string => {
  const { resetShareIntent, shareIntent } = useShareIntentContext();
  const shared = sharedLine([shareIntent.text, shareIntent.webUrl]);
  const [taken, setTaken] = useState(shared);
  if (shared !== "" && shared !== taken) {
    setTaken(shared);
  }
  useEffect(() => {
    if (shared !== "") {
      resetShareIntent();
    }
  }, [resetShareIntent, shared]);
  return taken;
};
