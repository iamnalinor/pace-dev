import { useRef, useState } from "react";

import type { Actions } from "@pace/client";
import type { Action, Event, MessageKey, ParseRequestBody } from "@pace/core";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";

/** Earlier turns a request may carry (`ParseRequestSchema.thread`). */
const MAX_THREAD = 5;

type Pending = {
  readonly text: string;
  readonly thread: NonNullable<ParseRequestBody["thread"]>;
  readonly actions: readonly Action[];
  readonly status: "parsed" | "unavailable";
};

const undoWritten =
  (
    written: readonly Event[],
    actions: Pick<Actions, "revoke">,
    run: ReturnType<typeof useRunAction>,
  ): (() => void) =>
  () => {
    void (async (): Promise<void> => {
      for (const event of written.toReversed()) {
        await run(actions.revoke(event.id));
      }
    })();
  };

const approvalFeedback = ({
  actions,
  run,
  t,
  written,
}: {
  readonly actions: Pick<Actions, "revoke">;
  readonly run: ReturnType<typeof useRunAction>;
  readonly t: ReturnType<typeof useT>;
  readonly written: readonly Event[];
}) =>
  written.length === 0
    ? undefined
    : {
        action: { label: t("common.undo"), onPress: undoWritten(written, actions, run) },
        success: t("assistant.approved"),
      };

/**
A correction of the shown actions, read with the whole thread. Five earlier turns are all a
request carries: a sixth correction says so (as the bot does) instead of vanishing.
*/
const revise = (
  pending: null | Pending,
  text: string,
  {
    read,
    setIssue,
  }: {
    readonly read: (text: string, thread: Pending["thread"]) => Promise<void>;
    readonly setIssue: (issue: MessageKey) => void;
  },
): void => {
  if (pending === null) {
    return;
  }
  if (pending.thread.length >= MAX_THREAD) {
    setIssue("assistant.tooManyCorrections");
    return;
  }
  void read(text, [...pending.thread, { text: pending.text, actions: [...pending.actions] }]);
};

/** One conversation with the assistant; a correction replaces actions before any write. */
export const usePendingActions = (
  domain: "activity" | "task",
  onApplied: (createdTaskId: null | string) => void,
) => {
  const { actions, assistant } = usePace();
  const t = useT();
  const run = useRunAction();
  const [pending, setPending] = useState<null | Pending>(null);
  const [issue, setIssue] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const requestRef = useRef(0);
  const isApprovingRef = useRef(false);
  const read = async (text: string, thread: Pending["thread"]): Promise<void> => {
    const current = ++requestRef.current;
    setBusy(true);
    setIssue(null);
    if (thread.length === 0) {
      setPending(null);
    }
    const answer = await assistant.propose(text, domain, thread);
    if (current !== requestRef.current) {
      return;
    }

    if (
      answer === null ||
      answer.status === "queued" ||
      answer.actions.length === 0 ||
      (thread.length > 0 && answer.status === "unavailable")
    ) {
      setIssue(thread.length > 0 ? "assistant.couldNotRevise" : "assistant.couldNotRead");
    } else {
      setPending({ actions: answer.actions, status: answer.status, text, thread });
    }
    setBusy(false);
  };
  return {
    busy,
    issue,
    pending,
    submit: (text: string): void => {
      void read(text, []);
    },
    followup: (text: string): void => {
      revise(pending, text, { read, setIssue });
    },
    cancel: (): void => {
      requestRef.current += 1;
      setPending(null);
      setIssue(null);
      setBusy(false);
    },
    approve: async (): Promise<void> => {
      if (pending === null || busy || isApprovingRef.current) {
        return;
      }
      isApprovingRef.current = true;
      setBusy(true);
      try {
        const result = await actions.applyActions(pending.actions);
        const written = result.ok ? [...result.value] : [];
        const isSuccess = await run(
          Promise.resolve(result),
          approvalFeedback({ actions, run, t, written }),
        );
        if (!isSuccess) {
          return;
        }
        setPending(null);
        const created = written.findLast((event) => event.type === "task.created");
        onApplied(created?.type === "task.created" ? created.payload.taskId : null);
      } finally {
        isApprovingRef.current = false;
        setBusy(false);
      }
    },
  };
};
