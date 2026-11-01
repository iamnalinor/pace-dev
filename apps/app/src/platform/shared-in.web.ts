import { useLocalSearchParams } from "expo-router";

import { sharedLine } from "./shared-line.ts";

/** A query value as one string (the router hands a repeated key over as a list). */
const first = (value: readonly string[] | string | undefined): string | undefined =>
  typeof value === "string" ? value : value?.[0];

/**
What the system's share sheet sent to the installed web app: the manifest's `share_target` opens
`/add?title=…&text=…&url=…` (QA round 17 M3: the text was thrown away).
*/
export const useSharedIn = (): string => {
  const { text, title, url } = useLocalSearchParams<{
    text?: string | string[];
    title?: string | string[];
    url?: string | string[];
  }>();
  return sharedLine([first(title), first(text), first(url)]);
};
