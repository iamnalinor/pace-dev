import { createContext, type ReactNode, use, useRef, useState } from "react";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useNewTaskRequest } from "#app/shared/new-task-request.ts";
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

/** Where the form came from: opened by hand, or holding what was read from the line. */
type FormOrigin = "by-hand" | "read";

/** The typed line, the chip taps and the assistant's reading, kept consistent with each other. */
const useDraft = (initialText: string, assistant: Assistant) => {
  const [text, setText] = useState(initialText);
  const [edits, setEdits] = useState<ComposerEdits>({});
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
      ai.reset();
    },
    setEdits,
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
    setForm,
  };
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

/** The composer's state and moves: the text, the reading, the form, and what each key does. */
const useFlowState = (
  initialText: string,
  initialForm: FormOrigin | null,
  isFormInPane: boolean,
) => {
  const { actions, assistant, hooks } = usePace();
  const run = useRunAction();
  const { ai, edits, onReading, onText, reset, setEdits, text } = useDraft(initialText, assistant);
  const model = hooks.useComposer({ edits, text });
  const { close, form, hide, lineFocus, setForm } = useFormState(initialForm);
  const done = (): void => {
    reset();
    close();
  };
  /** The assistant's reading (or, when it cannot read, the rules') opens the form. */
  const parse = async (line: string): Promise<void> => {
    const outcome = await ai.read(line, onReading);
    if (outcome !== null && outcome.status !== "queued") {
      setForm("read");
    }
  };
  const add = useAddTask(model, ai.state.status === "read", done);
  return {
    add,
    ai,
    /** An answer to the assistant's question joins the line, which is read again. */
    answer: (answer: string): void => {
      const next = `${text.trimEnd()} ${answer}`;
      onText(next);
      void parse(next);
    },
    close,
    /**
    Enter (or Send): the assistant reads the line into the form (a line it already read reopens
    as it was left); a line too short to read opens the form as it is.
    */
    enter: (): void => {
      if (ai.state.status === "read") {
        setForm("read");
      } else if (canAiRead(text)) {
        void parse(text);
      } else {
        setForm("read");
      }
    },
    /** New task: the form by hand, the line (if any) as its title; an open form stays as it is. */
    expand: (): void => {
      if (form === null) {
        setForm("by-hand");
      }
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
    text,
    toInbox: async (): Promise<void> => {
      if (await run(actions.captureInbox(text))) {
        done();
      }
    },
    /** A paste is read at once; typing never is. */
    type: (next: string): void => {
      // Against the line as it stands: after adding, the line is empty again.
      const isPaste = isPasted(text, next) && canAiRead(next);
      onText(next);
      if (isPaste) {
        void parse(next);
      }
    },
  };
};

export type ComposerFlow = ReturnType<typeof useFlowState>;

const ComposerContext = createContext<ComposerFlow | null>(null);

/**
One composer for Now: the line in the list and the form (in the card on a phone, in the right
pane on a computer) share it. New task (the sidebar's button, N, the line's +) opens the empty
form; `opensForm` opens it at once (New task arriving from elsewhere).
*/
export const ComposerProvider = ({
  children,
  initialText = "",
  isFormInPane = false,
  opensForm = false,
}: {
  readonly children: ReactNode;
  readonly initialText?: string | undefined;
  readonly isFormInPane?: boolean;
  readonly opensForm?: boolean;
}) => {
  const flow = useFlowState(initialText, opensForm ? "by-hand" : null, isFormInPane);
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
