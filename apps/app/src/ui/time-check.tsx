import { createContext, type ReactNode, use, useEffect, useState } from "react";

/**
Asks a field whether it holds typed text that is not a time (`true`), after it has said so under
itself.
*/
type HasUnreadable = () => boolean;

/** The time fields of one form (or one panel inside it) that its Save must hear first. */
export type TimeChecks = {
  readonly add: (hasUnreadable: HasUnreadable) => () => void;
  /** Every field is asked (each one wrong says so); `true` when none holds an unreadable time. */
  readonly isAllRead: () => boolean;
};

const TimeCheckContext = createContext<null | TimeChecks>(null);

const createChecks = (): TimeChecks => {
  const fields = new Set<HasUnreadable>();
  return {
    add: (hasUnreadable) => {
      fields.add(hasUnreadable);
      return () => {
        fields.delete(hasUnreadable);
      };
    },
    isAllRead: () => {
      // Every field is asked, so each wrong one says so, not only the first.
      const wrong = [...fields].map((hasUnreadable) => hasUnreadable());
      return !wrong.includes(true);
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
  useEffect(() => parent?.add(() => !checks.isAllRead()), [parent, checks]);
  return checks;
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
export const useTimeCheck = (hasUnreadable: HasUnreadable): void => {
  const checks = use(TimeCheckContext);
  useEffect(() => checks?.add(hasUnreadable), [checks, hasUnreadable]);
};
