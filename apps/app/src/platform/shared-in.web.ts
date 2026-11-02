import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { type SharedIn, sharedLine } from "./shared-line.ts";

/** A query value as one string (the router hands a repeated key over as a list). */
const first = (value: readonly string[] | string | undefined): string | undefined =>
  typeof value === "string" ? value : value?.[0];

/**
What the system's share sheet sent to the installed web app: the manifest's `share_target` opens
`/add?title=…&text=…&url=…` (QA round 17 M3: the text was thrown away).

The share is taken once: the line keeps it while the address drops the query, so a reload or a
return to the app's window does not fill the line again and a second Enter cannot add the same
task twice (review m11). `setParams` would clear the params but keep the route's `path`, which
the address is written from, so the route is navigated to again without them. Each arrival of a
share in the address counts up `seq` (the composer's key), so the same text shared again fills
the line again (round-4 review R2).
*/
export const useSharedIn = (): SharedIn => {
  const router = useRouter();
  const { text, title, url } = useLocalSearchParams<{
    text?: string | string[];
    title?: string | string[];
    url?: string | string[];
  }>();
  const shared = sharedLine([first(title), first(text), first(url)]);
  const [taken, setTaken] = useState({ seen: shared, seq: 0, text: shared });
  if (shared !== taken.seen) {
    setTaken(
      shared === ""
        ? { ...taken, seen: shared }
        : { seen: shared, seq: taken.seq + 1, text: shared },
    );
  }
  useEffect(() => {
    if (shared !== "") {
      router.navigate("/add");
    }
  }, [router, shared]);
  return { seq: taken.seq, text: taken.text };
};
