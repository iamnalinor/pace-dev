import { useShareIntentContext } from "expo-share-intent";
import { useEffect, useState } from "react";

import { type SharedIn, sharedLine } from "./shared-line.ts";

/**
What another app shared into Pace (Android's share sheet), as one composer line.

The share is taken once: the line keeps it while the provider (above the route gate) forgets it,
so the Add tab mounting again after a log-out and back in, or after the versions screen gives way,
does not fill the line with a share already added (the web's rule, review m11; sweep of QA round
17 round-3 review C1, bug class 36). It is taken once per arrival, not per content: the library
makes a new `shareIntent` for each share, and each one counts up `seq`, which the composer is
keyed by, so the same text shared again fills the line again (round-4 review R2).
*/
export const useSharedIn = (): SharedIn => {
  const { resetShareIntent, shareIntent } = useShareIntentContext();
  const shared = sharedLine([shareIntent.text, shareIntent.webUrl]);
  const [taken, setTaken] = useState({
    intent: shared === "" ? null : shareIntent,
    seq: 0,
    text: shared,
  });
  if (shared !== "" && shareIntent !== taken.intent) {
    setTaken({ intent: shareIntent, seq: taken.seq + 1, text: shared });
  }
  useEffect(() => {
    if (shared !== "") {
      resetShareIntent();
    }
  }, [resetShareIntent, shared]);
  return { seq: taken.seq, text: taken.text };
};
