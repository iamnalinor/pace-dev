import { useShareIntentContext } from "expo-share-intent";
import { useEffect, useState } from "react";

import { afterTyped, type ArrivingShare, type SharedIn, sharedLine } from "./shared-line.ts";

/** What the Add tab's line holds as typed: a share goes on a new line after it (round 6 M3). */
const draft = { text: "" };

/**
What another app shared into Pace (Android's share sheet), as one composer line.

The share is taken once: the line keeps it while the provider (above the route gate) forgets it,
so the Add tab mounting again after a log-out and back in, or after the versions screen gives way,
does not fill the line with a share already added (the web's rule, review m11; sweep of QA round
17 round-3 review C1, bug class 36). It is taken once per arrival, not per content: the library
makes a new `shareIntent` for each share, and each one counts up `seq`, which the composer is
keyed by, so the same text shared again fills the line again (round-4 review R2).
*/
export const useSharedIn = (): ArrivingShare => {
  const { resetShareIntent, shareIntent } = useShareIntentContext();
  const shared = sharedLine([shareIntent.text, shareIntent.webUrl]);
  const [taken, setTaken] = useState({
    intent: shared === "" ? null : shareIntent,
    seq: 0,
    text: shared,
  });
  if (shared !== "" && shareIntent !== taken.intent) {
    setTaken({ intent: shareIntent, seq: taken.seq + 1, text: afterTyped(draft.text, shared) });
  }
  useEffect(() => {
    if (shared !== "") {
      resetShareIntent();
    }
  }, [resetShareIntent, shared]);
  return { isNewTask: taken.text === "", seq: taken.seq, text: taken.text };
};

/**
A share handed on to Now at "/" by the web's share target. On a phone the share lands on the Add
tab itself (`useSharedIn`), so Now gets none.
*/
// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- the same hook as the web's, which does call hooks
export const useHandedShare = (): SharedIn | undefined => undefined;

/**
Which route's line keeps the draft a share goes after: the Add tab, where a phone's share lands
(Now's own line on the first tab is never touched by a share).
*/
export const LINE_DRAFT_ROUTE: "add" | "index" = "add";

/**
The Add tab's line tells what it holds as it is typed, so a share arriving there goes on a new
line after it instead of replacing it (round 6 M3). The line gone (the tab unmounted), its text is
gone with it, and so is the draft.
*/
export const useLineDraftNote = (text: string): void => {
  useEffect(() => {
    draft.text = text;
    return () => {
      if (draft.text === text) {
        draft.text = "";
      }
    };
  }, [text]);
};
