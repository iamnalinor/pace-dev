import { useRef, useState } from "react";

import type { Actions, Assistant } from "@pace/client";
import type {
  Action,
  DecisionResolution,
  Event,
  MessageKey,
  ParseQuestion,
  ParseRequestBody,
} from "@pace/core";

import { usePace, useT } from "#app/app-state.tsx";
import { readingIssue } from "#app/shared/assistant/reading-issue.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";

/** Earlier turns a request may carry (`ParseRequestSchema.thread`). */
const MAX_THREAD = 5;

type Pending = {
  readonly text: string;
  readonly thread: NonNullable<ParseRequestBody["thread"]>;
  readonly actions: readonly Action[];
  /** What the assistant asks about what stays unclear; answered by a correction. */
  readonly questions: readonly ParseQuestion[];
  readonly status: "parsed" | "unavailable";
  /** The decision-log rows of the conversation's readings, the last this one's. */
  readonly decisionIds: readonly string[];
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

/** An answer worth showing as a preview; `null` when there is nothing to approve. */
const pendingOf = (
  answer: Awaited<ReturnType<Assistant["propose"]>>,
  request: Pick<Pending, "decisionIds" | "text" | "thread">,
): null | Pending =>
  answer === null ||
  answer.status === "queued" ||
  answer.actions.length === 0 ||
  (request.thread.length > 0 && answer.status === "unavailable")
    ? null
    : {
        ...request,
        // This reading's row joins the conversation's (a draft or an older server names none).
        decisionIds:
          answer.decisionId === undefined
            ? request.decisionIds
            : [...request.decisionIds, answer.decisionId],
        actions: answer.actions,
        questions: answer.questions ?? [],
        status: answer.status,
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
    readonly read: (text: string, thread: Thread, decisionIds: Ids) => Promise<void>;
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
  void read(
    text,
    [...pending.thread, { text: pending.text, actions: [...pending.actions] }],
    pending.decisionIds,
  );
};

type Thread = Pending["thread"];
type Ids = Pending["decisionIds"];

/**
Tells the assistant log what became of the conversation (best effort, not awaited); answers
the task an approval created, if any (the last, as the screen opens it).
*/
const tellLog = (
  assistant: Pick<Assistant, "resolve">,
  pending: null | Pick<Pending, "decisionIds">,
  {
    resolution,
    written = [],
  }: { readonly resolution: DecisionResolution; readonly written?: readonly Event[] },
): null | string => {
  const created = written.findLast((event) => event.type === "task.created");
  const taskId = created?.type === "task.created" ? created.payload.taskId : null;
  if (pending !== null) {
    void assistant.resolve(pending.decisionIds, resolution, taskId);
  }
  return taskId;
};

/**
The text of a first reading in flight, or already read to nothing: asking again would only repeat
it (a paste is read at once, and the Enter after it may come during or after that reading; QA
round 13 M2). A ref, not state: both can land before a render. Any edit clears it.
*/
const useFirstRead = () => {
  const textRef = useRef<null | string>(null);
  return {
    clear: (): void => {
      textRef.current = null;
    },
    /** Kept only for a reading that found nothing: a preview is approved, a failure retried. */
    ended: (text: string, thread: Thread, isNothing: boolean): void => {
      textRef.current = isNothing && thread.length === 0 ? text : null;
    },
    isRepeat: (text: string): boolean => textRef.current === text,
    started: (text: string, thread: Thread): void => {
      textRef.current = thread.length === 0 ? text : null;
    },
  };
};

/** Approve: the actions written once (a second press waits), then the log told what they made. */
const useApprove = ({
  busy,
  onApplied,
  pending,
  setBusy,
  setPending,
}: {
  readonly busy: boolean;
  readonly onApplied: (createdTaskId: null | string) => void;
  readonly pending: null | Pending;
  readonly setBusy: (isBusy: boolean) => void;
  readonly setPending: (pending: null | Pending) => void;
}) => {
  const { actions, assistant } = usePace();
  const t = useT();
  const run = useRunAction();
  const isApprovingRef = useRef(false);
  return async (): Promise<void> => {
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
      onApplied(tellLog(assistant, pending, { resolution: "approved", written }));
    } finally {
      isApprovingRef.current = false;
      setBusy(false);
    }
  };
};

/** One conversation with the assistant; a correction replaces actions before any write. */
export const usePendingActions = (
  domain: "activity" | "task",
  onApplied: (createdTaskId: null | string) => void,
) => {
  const { assistant } = usePace();
  const [pending, setPending] = useState<null | Pending>(null);
  const [issue, setIssue] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const requestRef = useRef(0);
  const firstRead = useFirstRead();
  const read = async (text: string, thread: Thread, decisionIds: Ids = []): Promise<void> => {
    const current = ++requestRef.current;
    firstRead.started(text, thread);
    setBusy(true);
    setIssue(null);
    if (thread.length === 0) {
      setPending(null);
    }
    const answer = await assistant.propose(text, domain, thread);
    if (current !== requestRef.current) {
      return;
    }
    const next = pendingOf(answer, { decisionIds, text, thread });
    firstRead.ended(text, thread, next === null && answer?.status === "parsed");
    if (next === null) {
      setIssue(readingIssue(answer, { domain, isRevision: thread.length > 0 }));
    } else {
      setPending(next);
    }
    setBusy(false);
  };
  const drop = (resolution: "cancelled" | "inbox"): void => {
    tellLog(assistant, pending, { resolution });
    requestRef.current += 1;
    firstRead.clear();
    setPending(null);
    setIssue(null);
    setBusy(false);
  };
  return {
    busy,
    issue,
    pending,
    submit: (text: string): void => {
      if (!firstRead.isRepeat(text)) {
        void read(text, []);
      }
    },
    followup: (text: string): void => {
      revise(pending, text, { read, setIssue });
    },
    /** The line went to the Inbox instead: the preview of it goes, and the log is told. */
    keptInInbox: (): void => {
      drop("inbox");
    },
    /** Dismissed (Cancel, Escape, or the line changed under it): the log is told once. */
    cancel: (): void => {
      drop("cancelled");
    },
    approve: useApprove({ busy, onApplied, pending, setBusy, setPending }),
  };
};
