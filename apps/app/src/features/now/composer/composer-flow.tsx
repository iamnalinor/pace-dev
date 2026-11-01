import { createContext, type ReactNode, use, useRef, useState } from "react";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { usePendingActions } from "#app/shared/assistant/use-pending-actions.ts";
import { useNewTaskRequest } from "#app/shared/new-task-request.ts";
import { withDraft } from "#app/shared/task-fields/subtask-list.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { useToast } from "#app/ui/toast.tsx";
import { useHotkey } from "#app/ui/use-hotkey.tsx";
import {
  type AiOutcome,
  type AiReading,
  type Assistant,
  canAiRead,
  type ComposerEdits,
  type ComposerModel,
  isPasted,
} from "@pace/client";
import { useAiRead } from "@pace/client/react";

import type { FormOrigin } from "./form-title.ts";

/** A bare number is a subtask number ("290"); anything else is a label. */
export const subtaskOf = (label: string): ComposerModel["subtasks"][number] => {
  const number = /^\d+$/u.test(label) ? Number(label) : null;
  return { label, number };
};

/** The typed line, the chip taps and the assistant's reading, kept consistent with each other. */
const useDraft = (initialText: string, assistant: Assistant) => {
  const [text, setText] = useState(initialText);
  const [edits, setEdits] = useState<ComposerEdits>({});
  // A subtask typed into the form's field and not yet added with Enter: Create keeps it too.
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const ai = useAiRead(assistant);
  return {
    ai,
    edits,
    /** The assistant's chips go over the taps so far. */
    onReading: (reading: AiReading): void => {
      setEdits((current) => ({ ...current, ...reading.edits }));
    },
    /** New text makes the assistant's reading stale: its title and subtasks give way to the rules. */
    onText: (next: string): void => {
      if (ai.state.status === "read") {
        setEdits(({ projectName: _name, subtasks: _subtasks, title: _title, ...rest }) => rest);
      }
      setText(next);
      ai.reset();
    },
    reset: (): void => {
      setText("");
      setEdits({});
      setSubtaskDraft("");
      ai.reset();
    },
    setEdits,
    setSubtaskDraft,
    subtaskDraft,
    text,
  };
};

/** "Read it when it's back" went through: the server keeps the line, so the composer clears. */
const useReadLater = (ask: () => Promise<AiOutcome | null>, onSaved: () => void) => {
  const t = useT();
  const toast = useToast();
  const { deviceTz } = useViewer();
  return async (): Promise<void> => {
    const outcome = await ask();
    if (outcome?.status !== "queued") {
      return;
    }
    toast.show({
      message:
        outcome.retryAt === null
          ? t("composer.aiQueuedSoon")
          : t("composer.aiQueued", { time: clockTime(outcome.retryAt, deviceTz) }),
    });
    onSaved();
  };
};

/**
To Inbox: the line is kept as a note and a toast says so; a preview of it goes, and the assistant
log hears so.
*/
const useToInbox = (
  text: string,
  pending: Pick<ReturnType<typeof usePendingActions>, "keptInInbox">,
  done: () => void,
) => {
  const { actions } = usePace();
  const run = useRunAction();
  const toast = useToast();
  const t = useT();
  return async (): Promise<void> => {
    if (!(await run(actions.captureInbox(text)))) {
      return;
    }
    // Where the line went, in words: only the Inbox badge moved before (QA round 14 L10).
    toast.show({ message: t("composer.toInboxDone") });

    pending.keptInInbox();
    done();
  };
};

/** The form's place and the line's cursor: open, closed, and where the cursor goes back to. */
const useFormState = (initialForm: FormOrigin | null) => {
  const [form, setForm] = useState<FormOrigin | null>(initialForm);
  // Each time it grows, the cursor goes back to the line (after adding, or closing the form).
  const [lineFocus, setLineFocus] = useState(0);
  return {
    /** Closes the form, the cursor back in the line. */
    close: (): void => {
      setForm(null);
      setLineFocus((count) => count + 1);
    },
    form,
    /** Closes the form and leaves the cursor where it is (a task was picked instead). */
    hide: (): void => {
      setForm(null);
    },
    lineFocus,
    /** The cursor back in the line (the card it opened was dismissed). */
    refocus: (): void => {
      setLineFocus((count) => count + 1);
    },
    setForm,
  };
};

/** The edits with the subtask still being typed added last, as Create takes them. */
const withSubtaskDraft = (
  edits: ComposerEdits,
  model: ComposerModel,
  draft: string,
): ComposerEdits =>
  draft.trim() === ""
    ? edits
    : {
        ...edits,
        subtasks: withDraft(
          model.subtasks.map((subtask) => subtask.label),
          draft,
        ).map((label) => subtaskOf(label)),
      };

/** Adds the form's task once (a held Enter or a double press adds once), then `done`. */
const useAddTask = (model: ComposerModel, isReadByAssistant: boolean, done: () => void) => {
  const { actions } = usePace();
  const run = useRunAction();
  const isAddingRef = useRef(false);
  return async (): Promise<void> => {
    // A title cleared in the form is not filled back from the line behind the user's back.
    if (!model.canAdd || isAddingRef.current) {
      return;
    }
    isAddingRef.current = true;
    try {
      if (await run(actions.createFromComposer(model, { readByAssistant: isReadByAssistant }))) {
        done();
      }
    } finally {
      isAddingRef.current = false;
    }
  };
};

const resetAndClose =
  (reset: () => void, close: () => void): (() => void) =>
  () => {
    reset();
    close();
  };

/**
Enter reviews an action or approves the preview already shown; a line too short to read opens
the form. While the assistant reads (a paste is read at once, before any Enter) it waits: a
second request would only repeat the first (QA round 13 M2).
*/
const enterOf =
  (
    pending: Pick<ReturnType<typeof usePendingActions>, "approve" | "busy" | "pending" | "submit">,
    text: string,
    openForm: () => void,
  ) =>
  (): void => {
    if (pending.busy) {
      return;
    }
    if (pending.pending !== null) {
      void pending.approve();
    } else if (canAiRead(text)) {
      pending.submit(text);
    } else {
      openForm();
    }
  };

/** The composer's state and moves: the text, the reading, the form, and what each key does. */
const useFlowState = ({
  initialText,
  initialForm,
  isFormInPane,
  onCreatedTask,
}: {
  readonly initialText: string;
  readonly initialForm: FormOrigin | null;
  readonly isFormInPane: boolean;
  readonly onCreatedTask: (taskId: string) => void;
}) => {
  const { assistant, hooks } = usePace();
  const draft = useDraft(initialText, assistant);
  const { ai, edits, onReading, onText, reset, setEdits, text } = draft;
  const model = hooks.useComposer({ edits, text });
  // What Create adds: the form as shown, with a subtask still being typed.
  const toAdd = hooks.useComposer({
    edits: withSubtaskDraft(edits, model, draft.subtaskDraft),
    text,
  });
  const { close, form, hide, lineFocus, refocus, setForm } = useFormState(initialForm);
  const done = resetAndClose(reset, close);
  const pending = usePendingActions("task", (createdTaskId) => {
    done();
    if (createdTaskId !== null) {
      onCreatedTask(createdTaskId);
    }
  });
  const add = useAddTask(toAdd, form === "assistant", done);
  return {
    add,
    ai,
    pending,
    answer: pending.followup,
    close,
    /** Escape or Cancel: the assistant's card goes, the text stays, the cursor back in the line. */
    dismiss: (): void => {
      pending.cancel();
      refocus();
    },
    enter: enterOf(pending, text, () => {
      setForm("by-hand");
    }),
    /** New task opens the manual form; the assistant's preview goes (the person may still add it). */
    expand: (): void => {
      if (form !== null) {
        return;
      }
      pending.discard();
      if (ai.state.status === "read") {
        onText(text);
      }
      setForm("by-hand");
    },
    form,
    hide,
    /** On a wide window the form opens in Now's right pane; on a phone, in the line's card. */
    isFormInPane,
    lineFocus,
    model,
    onText,
    readLater: useReadLater(async () => await ai.readLater(text, onReading), done),
    setEdits,
    setSubtaskDraft: draft.setSubtaskDraft,
    subtaskDraft: draft.subtaskDraft,
    text,
    toInbox: useToInbox(text, pending, done),
    /** A paste is read at once; typing never is. */
    type: (next: string): void => {
      // Against the line as it stands: after adding, the line is empty again.
      const isPaste = isPasted(text, next) && canAiRead(next);
      pending.discard();
      onText(next);
      if (isPaste) {
        pending.submit(next);
      }
    },
  };
};

export type ComposerFlow = ReturnType<typeof useFlowState>;

const ComposerContext = createContext<ComposerFlow | null>(null);
const ignoreCreatedTask = (_taskId: string): void => undefined;

/**
One composer for Now: the line in the list and the form (in the card on a phone, in the right
pane on a computer) share it. New task (the sidebar's button, N, the line's +) opens the empty
form; `opensForm` opens it at once (New task arriving from elsewhere).
*/
export const ComposerProvider = ({
  children,
  initialText = "",
  isFormInPane = false,
  onCreatedTask = ignoreCreatedTask,
  opensForm = false,
}: {
  readonly children: ReactNode;
  readonly initialText?: string | undefined;
  readonly isFormInPane?: boolean;
  readonly onCreatedTask?: (taskId: string) => void;
  readonly opensForm?: boolean;
}) => {
  const flow = useFlowState({
    initialForm: opensForm ? "by-hand" : null,
    initialText,
    isFormInPane,
    onCreatedTask,
  });
  useNewTaskRequest(flow.expand);
  useHotkey(HOTKEYS.newTask, flow.expand);
  return <ComposerContext value={flow}>{children}</ComposerContext>;
};

/** The composer's state, from the `ComposerProvider` around Now. */
export const useComposerFlow = (): ComposerFlow => {
  const flow = use(ComposerContext);
  if (flow === null) {
    throw new Error("useComposerFlow needs a ComposerProvider above it");
  }
  return flow;
};
