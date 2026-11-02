import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { sharedLine } from "./shared-line.ts";

/** A query value as one string (the router hands a repeated key over as a list). */
const first = (value: readonly string[] | string | undefined): string | undefined =>
  typeof value === "string" ? value : value?.[0];

/**
What the system's share sheet sent to the installed web app: the manifest's `share_target` opens
`/add?title=…&text=…&url=…` (QA round 17 M3: the text was thrown away).

The share is taken once: the line keeps it while the address drops the query, so a reload or a
return to the app's window does not fill the line again and a second Enter cannot add the same
task twice (review m11). A new share replaces it.
*/
export const useSharedIn = (): string => {
  const router = useRouter();
  const { text, title, url } = useLocalSearchParams<{
    text?: string | string[];
    title?: string | string[];
    url?: string | string[];
  }>();
  const shared = sharedLine([first(title), first(text), first(url)]);
  const [taken, setTaken] = useState(shared);
  if (shared !== "" && shared !== taken) {
    setTaken(shared);
  }
  useEffect(() => {
    if (shared !== "") {
      router.setParams({ text: undefined, title: undefined, url: undefined });
    }
  }, [router, shared]);
  return taken;
};
