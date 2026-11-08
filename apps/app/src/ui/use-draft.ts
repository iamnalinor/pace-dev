import {
  createContext,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import { draftStorage } from "#app/platform/draft-storage.ts";
import { createDraftBook, ownerTag } from "#app/platform/drafts.ts";

const book = createDraftBook({ storage: draftStorage });

/**
Who is typing: the current session's token, read when a draft is read or written (so a sign-in
or a sign-out between two keystrokes is seen). The app's `PaceProvider` gives it; without one
(signed out, a test) nothing is kept.
*/
export const DraftOwnerContext = createContext<() => string | undefined>(() => undefined);

/** Every draft on this device goes (sign-out: the next person sees none, bug-lessons 103). */
export const forgetDrafts = (): void => {
  book.forget();
};

/** The draft's key for the current account, or null when nothing may be kept. */
const useOwner = (): (() => null | string) => {
  const session = use(DraftOwnerContext);
  return useCallback(() => ownerTag(session()), [session]);
};

/** Drops a field's draft on purpose (Cancel): the next time it opens with what is saved. */
export const useDiscardDraft = (): ((key: string | undefined) => void) => {
  const owner = useOwner();
  return useCallback(
    (key) => {
      const who = owner();
      if (key !== undefined && who !== null) {
        book.remove(who, key);
      }
    },
    [owner],
  );
};

/**
Keeps a text field's unsent text on this device under `key` (feedback 5 item 7). When the field
mounts it restores the draft, but only over the value it was made from (an edit of a title that
has changed since is stale and goes). Every later change is kept; the text emptied, or back to
the value the field opened with, keeps nothing, so a submit that clears the field clears its draft.
Without a key, or signed out, it does nothing: a secret (a token, a code) never gets a key.
*/
export const useDraft = (
  key: string | undefined,
  value: string,
  onChange: ((text: string) => void) | undefined,
): void => {
  const owner = useOwner();
  // What the field opened with under this key: a new key (another task) starts again.
  const [origin, setOrigin] = useState({ base: value, key });
  if (origin.key !== key) {
    setOrigin({ base: value, key });
  }
  const base = origin.key === key ? origin.base : value;
  // The key restored so far, and the value last kept: effects only, never read while drawing.
  const restoredRef = useRef<string | undefined>(undefined);
  const writtenRef = useRef(value);

  // Once per key, as the field mounts: the value read is the one it opened with.
  const restore = useEffectEvent((): void => {
    const who = owner();
    if (key === undefined || who === null || restoredRef.current === key) {
      return;
    }
    restoredRef.current = key;
    writtenRef.current = value;
    const draft = book.read(who, key);
    if (draft === null) {
      return;
    }
    if (draft.base === base) {
      if (draft.text !== value) {
        onChange?.(draft.text);
      }
    } else {
      book.remove(who, key);
    }
  });
  useEffect(() => {
    restore();
  }, [key]);

  useEffect(() => {
    const who = owner();
    if (
      key === undefined ||
      who === null ||
      restoredRef.current !== key ||
      writtenRef.current === value
    ) {
      return;
    }
    writtenRef.current = value;
    if (value === "" || value === base) {
      book.remove(who, key);
    } else {
      book.write(who, key, { base, text: value });
    }
  }, [base, key, owner, value]);
};
