import { createContext, type ReactNode, use, useEffect, useRef, useState } from "react";

/**
What a time field answers its form's Save: it holds what the form has (`read`), it holds typed text
that is not a time and says so under itself (`wrong`), or it just handed the form a time the form
has not drawn yet (`waits`: «7» read whole is 07:00), so the Save runs again once it has.
*/
export type TimeVerdict = "read" | "waits" | "wrong";

/**
Asks a field for its verdict. With `canHandOver` false the field hands nothing over (another field
of the same press already did, and both would build on the same stale draft): it says `waits`.
*/
export type TimeCheck = (canHandOver: boolean) => TimeVerdict;

/** The time fields of one form (or one panel inside it) that its Save must hear first. */
export type TimeChecks = {
  readonly add: (check: TimeCheck) => () => void;
  /** Every field is asked (each one wrong says so); at most one hands a time over per press. */
  readonly verdict: (canHandOver?: boolean) => TimeVerdict;
};

const TimeCheckContext = createContext<null | TimeChecks>(null);

const createChecks = (): TimeChecks => {
  const fields = new Set<TimeCheck>();
  return {
    add: (check) => {
      fields.add(check);
      return () => {
        fields.delete(check);
      };
    },
    verdict: (canHandOver = true) => {
      let isHandOverFree = canHandOver;
      // Every field is asked, so each wrong one says so, not only the first.
      const verdicts = new Set(
        [...fields].map((check) => {
          const verdict = check(isHandOverFree);
          isHandOverFree &&= verdict !== "waits";
          return verdict;
        }),
      );
      if (verdicts.has("wrong")) {
        return "wrong";
      }
      return verdicts.has("waits") ? "waits" : "read";
    },
  };
};

/**
The checks of a form's time fields: a Save or Done that finds one holding text that is not a time
refuses, and the field says why, as Day's sheet does (QA round 27 R27-02). A scope inside another
(the date panel inside the task sheet) is also asked by the outer one.
*/
export const useTimeChecks = (): TimeChecks => {
  const parent = use(TimeCheckContext);
  const [checks] = useState(createChecks);
  useEffect(() => parent?.add((canHandOver) => checks.verdict(canHandOver)), [parent, checks]);
  return checks;
};

/**
A form's Save (Done, Create) behind its time fields: it runs when every field holds what the form
has, does nothing when one holds text that is not a time (the field says why), and when a field
just handed a time over («7» read as 07:00), it runs again after the render that gives the form
that time, so one press saves it (review of the QA 27 wave, I3): the press's own closure holds the
draft from before. `submit` sees the render it runs in, and checks its own conditions (a disabled
button is not pressed, but a press run again is not a button press).
*/
export const useCheckedSubmit = (checks: TimeChecks, submit: () => void): (() => void) => {
  const [again, setAgain] = useState(0);
  const press = (): void => {
    const verdict = checks.verdict();
    if (verdict === "read") {
      submit();
    } else if (verdict === "waits") {
      setAgain((count) => count + 1);
    }
  };
  const pressRef = useRef(press);
  useEffect(() => {
    pressRef.current = press;
  });
  useEffect(() => {
    if (again > 0) {
      pressRef.current();
    }
  }, [again]);
  return press;
};

/** Hands a form's checks to the time fields inside it. */
export const TimeCheckScope = ({
  checks,
  children,
}: {
  readonly checks: TimeChecks;
  readonly children: ReactNode;
}) => <TimeCheckContext value={checks}>{children}</TimeCheckContext>;

/** Registers a time field's check with the form around it, if any. */
export const useTimeCheck = (check: TimeCheck): void => {
  const checks = use(TimeCheckContext);
  useEffect(() => checks?.add(check), [checks, check]);
};
