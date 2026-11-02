import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";

import { type SharedIn, sharedLine } from "./shared-line.ts";

/** A query value as one string (the router hands a repeated key over as a list). */
const first = (value: readonly string[] | string | undefined): string | undefined =>
  typeof value === "string" ? value : value?.[0];

/**
The share taken from the address, waiting for Now at "/" to put it into its line; `null` once Now
has it. Kept for the page's life, not in a screen: the share target and Now are two routes.
*/
const handoff = {
  arrivals: 0,
  listeners: new Set<() => void>(),
  waiting: null as null | SharedIn,
};

const hand = (text: string): void => {
  handoff.arrivals += 1;
  handoff.waiting = { seq: handoff.arrivals, text };
  for (const listener of handoff.listeners) {
    listener();
  }
};

const subscribe = (listener: () => void): (() => void) => {
  handoff.listeners.add(listener);
  return () => {
    handoff.listeners.delete(listener);
  };
};

/**
The share target: what the system's share sheet sent to the installed web app (the manifest's
`share_target` opens `/add?title=…&text=…&url=…`, QA round 17 M3), taken from the address once
and handed to Now at "/" (`useHandedShare`), the address replaced: a reload or a return to the
window opens Now and never fills the line again, so a second Enter cannot add the same task twice
(review m11), and no empty New task form opens on a reload (QA round 18 L2). Until it is handed
on, the line shows it here; without a share, /add is New task (an empty line).
*/
export const useSharedIn = (): SharedIn => {
  const router = useRouter();
  const { text, title, url } = useLocalSearchParams<{
    text?: string | string[];
    title?: string | string[];
    url?: string | string[];
  }>();
  const shared = sharedLine([first(title), first(text), first(url)]);
  useEffect(() => {
    if (shared === "") {
      return;
    }

    hand(shared);
    router.replace("/");
  }, [router, shared]);
  return { seq: 0, text: shared };
};

/**
Now's share, if the share target handed one on: taken once per arrival (each counts up `seq`,
which the composer is keyed by, so the same text shared again fills the line again, round-4
review R2); once Now has it the hand-off forgets it, so a remount does not bring it back.
*/
export const useHandedShare = (): SharedIn | undefined => {
  const waiting = useSyncExternalStore(subscribe, () => handoff.waiting);
  const [taken, setTaken] = useState<SharedIn | undefined>(waiting ?? undefined);
  if (waiting !== null && waiting.seq !== taken?.seq) {
    setTaken(waiting);
  }
  useEffect(() => {
    if (waiting !== null && handoff.waiting === waiting) {
      handoff.waiting = null;
    }
  }, [waiting]);
  return taken;
};
