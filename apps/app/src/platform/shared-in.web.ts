import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";

import { afterTyped, type ArrivingShare, type SharedIn, sharedLine } from "./shared-line.ts";

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

/** Where Now's half-typed line is kept: the tab's sessionStorage (a page of its own, else memory). */
const DRAFT_KEY = "pace.lineDraft";
const draftInMemory = { text: "" };

const readDraft = (): string => {
  try {
    return globalThis.sessionStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return draftInMemory.text;
  }
};

const keepDraft = (text: string): void => {
  draftInMemory.text = text;
  try {
    if (text === "") {
      globalThis.sessionStorage.removeItem(DRAFT_KEY);
    } else {
      globalThis.sessionStorage.setItem(DRAFT_KEY, text);
    }
  } catch {
    // Blocked storage: the page's memory keeps it for a share within the page.
  }
};

/** Which route's line keeps the draft a share goes after: Now at "/" (the share target hands on there). */
export const LINE_DRAFT_ROUTE: "add" | "index" = "index";

/**
Now's line tells what it holds as it is typed, and that stays when the line goes away: the share
target reads it after "/" has gone (a route change in the page) or in a new page of the same tab
(the installed app's share opens one), and puts the share on a new line after it (QA round 19 L4,
QA round 20 M3, round 6 M3). An emptied line (a task added) leaves nothing.
*/
export const useLineDraftNote = (text: string): void => {
  useEffect(() => {
    keepDraft(text);
  }, [text]);
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
export const useSharedIn = (): ArrivingShare => {
  const router = useRouter();
  const { text, title, url } = useLocalSearchParams<{
    text?: string | string[];
    title?: string | string[];
    url?: string | string[];
  }>();
  // A share is any of its keys in the address, blank ones too (QA round 19 L4: `/add?text=%20`
  // stayed on a dead address); a bare /add is New task.
  const isShare = [text, title, url].some((value) => value !== undefined);
  const shared = sharedLine([first(title), first(text), first(url)]);
  useEffect(() => {
    if (!isShare) {
      return;
    }

    hand(afterTyped(readDraft(), shared));
    router.replace("/");
  }, [isShare, router, shared]);
  return { isNewTask: !isShare, seq: 0, text: shared };
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
