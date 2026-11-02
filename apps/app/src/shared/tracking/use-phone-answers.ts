import { useCallback, useRef, useState } from "react";

import {
  dismiss as rememberDismissed,
  type SeriesRule,
  setSeriesRule,
} from "#app/platform/phone-memory.ts";

export type PhoneAnswers = {
  /** Events waved away here this session, whether or not the phone's storage kept them. */
  readonly dismissed: ReadonlySet<string>;
  /** Series rules given here this session, the same way. */
  readonly rules: readonly SeriesRule[];
  readonly dismiss: (key: string) => void;
  readonly remember: (rule: SeriesRule) => void;
};

/**
Answers kept on the phone (a dismissed event, a series rule): shown at once, then written to the
phone's storage (slow on Android's keystore, bug-lessons 57), then `reload` reads back what was
kept. A refused write still holds for this session (the server's own answer covers the next
start); it is never an unhandled rejection.
*/
export const usePhoneAnswers = (reload: () => void): PhoneAnswers => {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [rules, setRules] = useState<readonly SeriesRule[]>([]);
  const keep = useCallback(
    (write: () => Promise<void>): void => {
      void (async () => {
        try {
          await write();
        } catch {
          // Kept for this session only: the phone did not store it.
        }
        reload();
      })();
    },
    [reload],
  );
  return {
    dismiss: (key) => {
      setDismissed((current) => new Set([...current, key]));
      keep(async () => {
        await rememberDismissed(key);
      });
    },
    dismissed,
    remember: (rule) => {
      setRules((current) => [...current.filter((each) => each.series !== rule.series), rule]);
      keep(async () => {
        await setSeriesRule(rule);
      });
    },
    rules,
  };
};

/**
A reload that only lands when no later one started: an answer read before a newer change never
overwrites it (two reads in flight finish in any order).
*/
export const useLatestLoad = <T>(apply: (value: T) => void): ((read: () => Promise<T>) => void) => {
  const latestRef = useRef(0);
  return useCallback(
    (read) => {
      latestRef.current += 1;
      const mine = latestRef.current;
      void (async () => {
        const value = await read();
        if (mine === latestRef.current) {
          apply(value);
        }
      })();
    },
    [apply],
  );
};
