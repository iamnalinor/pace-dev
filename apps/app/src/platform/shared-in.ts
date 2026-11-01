import { useShareIntentContext } from "expo-share-intent";

import { sharedLine } from "./shared-line.ts";

/** What another app shared into Pace (Android's share sheet), as one composer line. */
export const useSharedIn = (): string => {
  const { shareIntent } = useShareIntentContext();
  return sharedLine([shareIntent.text, shareIntent.webUrl]);
};
