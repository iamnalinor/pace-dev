import { useCallback, useRef, useState } from "react";

import {
  dismiss as rememberDismissed,
  type SeriesRule,
  setSeriesRule,
} from "#app/platform/phone-memory.ts";

export type PhoneAnswers = {
  /** Events waved away here whose write is still on its way, or was refused this session. */
  readonly dismissed: ReadonlySet<string>;
  /** Series rules given here, the same way. */
  readonly rules: readonly SeriesRule[];
  readonly dismiss: (key: string) => void;
  readonly remember: (rule: SeriesRule) => void;
};

/** One answer laid over what the phone's storage says, until that storage holds it. */
type Held<T> = { readonly id: number; readonly value: T; readonly isRefused: boolean };

/**
Answers kept on the phone (a dismissed event, a series rule): shown at once, then written to the
phone's storage (slow on Android's keystore, bug-lessons 57). The overlay holds an answer only
while its write is on its way: once it landed and a read has it, the read wins (so a rule removed
in Settings → Permissions stops holding). A refused write holds for this session, until the
phone's memory changes elsewhere (`memory`, its change count); it is never an unhandled rejection.
`reload` answers once a read that started after the call has been applied.
*/
export const usePhoneAnswers = (reload: () => Promise<void>, memory: number): PhoneAnswers => {
  const [held, setHeld] = useState<{
    readonly dismissed: readonly Held<string>[];
    readonly rules: readonly Held<SeriesRule>[];
  }>({ dismissed: [], rules: [] });
  const nextRef = useRef(0);
  // A change to what the phone remembers made elsewhere (Permissions forgot a rule): answers
  // that could not be saved give way to it. Adjusted while rendering, not in an effect.
  const [seenMemory, setSeenMemory] = useState(memory);
  if (seenMemory !== memory) {
    setSeenMemory(memory);
    setHeld((current) => ({
      dismissed: current.dismissed.filter((each) => !each.isRefused),
      rules: current.rules.filter((each) => !each.isRefused),
    }));
  }
  const keep = useCallback(
    (kind: "dismissed" | "rules", id: number, write: () => Promise<void>): void => {
      const settle = (isLanded: boolean): void => {
        setHeld((current) => ({
          ...current,
          [kind]: isLanded
            ? current[kind].filter((each) => each.id !== id)
            : current[kind].map((each) => (each.id === id ? { ...each, isRefused: true } : each)),
        }));
      };
      void (async () => {
        try {
          await write();
        } catch {
          // Kept for this session only: the phone did not store it.
          settle(false);
          await reload();
          return;
        }
        // Landed: the overlay lets go once a read that holds it is on the screen.
        await reload();
        settle(true);
      })();
    },
    [reload],
  );
  return {
    dismiss: (key) => {
      nextRef.current += 1;
      const id = nextRef.current;
      setHeld((current) => ({
        ...current,
        dismissed: [...current.dismissed, { id, isRefused: false, value: key }],
      }));
      keep("dismissed", id, async () => {
        await rememberDismissed(key);
      });
    },
    dismissed: new Set(held.dismissed.map((each) => each.value)),
    remember: (rule) => {
      nextRef.current += 1;
      const id = nextRef.current;
      setHeld((current) => ({
        ...current,
        rules: [...current.rules, { id, isRefused: false, value: rule }],
      }));
      keep("rules", id, async () => {
        await setSeriesRule(rule);
      });
    },
    // The latest answer per series wins.
    rules: new Map(held.rules.map((each) => [each.value.series, each.value])).values().toArray(),
  };
};

/**
A reload that only lands when no later one started: an answer read before a newer change never
overwrites it (two reads in flight finish in any order). A read that fails keeps what is shown.
The promise answers once a read started at or after the call has finished (applied or failed).
*/
export const useLatestLoad = <T>(
  apply: (value: T) => void,
): ((read: () => Promise<T>) => Promise<void>) => {
  const latestRef = useRef(0);
  const waitersRef = useRef<{ readonly at: number; readonly done: () => void }[]>([]);
  return useCallback(
    async (read) => {
      latestRef.current += 1;
      const mine = latestRef.current;
      const finished = new Promise<void>((resolve) => {
        waitersRef.current.push({ at: mine, done: resolve });
      });
      try {
        const value = await read();
        if (mine === latestRef.current) {
          apply(value);
        }
      } catch {
        // Unreadable right now: what is on the screen stays.
      }
      if (mine === latestRef.current) {
        for (const waiter of waitersRef.current) {
          waiter.done();
        }
        waitersRef.current = [];
      }
      await finished;
    },
    [apply],
  );
};
