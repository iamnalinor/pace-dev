import { type ReactNode, useRef, useState } from "react";
import { Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { AnimatedHeight } from "#app/ui/animated-height.tsx";
import { cx } from "#app/ui/cx.ts";
import { useToast } from "#app/ui/toast.tsx";
import { KEYBOARD } from "#app/ui/use-hotkey.tsx";
import {
  type AiOutcome,
  type AiReading,
  type Assistant,
  canAiRead,
  type ComposerEdits,
  isPasted,
} from "@pace/client";
import { useAiRead } from "@pace/client/react";

import { AiStatus } from "./ai-status.tsx";
import { ComposerForm } from "./composer-form.tsx";
import { QuickActions, QuickLine } from "./quick-line.tsx";

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
    /** New text makes the assistant's reading stale: its title and problems give way to the rules. */
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

/** The composer's state and moves: the text, the reading, the form, and what each key does. */
const useComposerFlow = (initialText: string) => {
  const { actions, assistant, hooks } = usePace();
  const run = useRunAction();
  const { ai, edits, onReading, onText, reset, setEdits, text } = useDraft(initialText, assistant);
  const model = hooks.useComposer({ edits, text });
  const [form, setForm] = useState<"by-hand" | "read" | null>(null);
  // Back at the line after adding or folding the form: the cursor goes with it.
  const [isLineFocused, setIsLineFocused] = useState(false);
  // A held Enter or a double press adds once.
  const isAddingRef = useRef(false);
  const done = (): void => {
    reset();
    setForm(null);
    setIsLineFocused(true);
  };
  /** The assistant's reading (or, when it cannot read, the rules') unfolds the form. */
  const parse = async (line: string): Promise<void> => {
    const outcome = await ai.read(line, onReading);
    if (outcome !== null && outcome.status !== "queued") {
      setForm("read");
    }
  };
  const add = async (): Promise<void> => {
    // A title cleared in the form is not filled back from the line behind the user's back.
    if (!model.canAdd || isAddingRef.current) {
      return;
    }
    isAddingRef.current = true;
    const isReadByAssistant = ai.state.status === "read";
    try {
      if (await run(actions.createFromComposer(model, { readByAssistant: isReadByAssistant }))) {
        done();
      }
    } finally {
      isAddingRef.current = false;
    }
  };
  const toInbox = async (): Promise<void> => {
    if (await run(actions.captureInbox(text))) {
      done();
    }
  };
  return {
    add,
    ai,
    collapse: (): void => {
      setForm(null);
      setIsLineFocused(true);
    },
    /** An answer to the assistant's question joins the line, which is read again. */
    answer: (answer: string): void => {
      const next = `${text.trimEnd()} ${answer}`;
      onText(next);
      void parse(next);
    },
    /**
    Enter: the assistant reads the line into the form (a line it already read reopens as it was
    left); a line too short to read opens the form as it is.
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
    expand: (): void => {
      setForm("by-hand");
    },
    form,
    isLineFocused,
    model,
    onText,
    readLater: useReadLater(async () => await ai.readLater(text, onReading), done),
    setEdits,
    text,
    toInbox,
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

/** The line with, once something is typed, the keys, what is going on and the two actions. */
const LineBlock = ({
  flow,
  isFocused,
  onFocusChange,
  status,
}: {
  readonly flow: ReturnType<typeof useComposerFlow>;
  readonly isFocused: boolean;
  readonly onFocusChange: (isInFocus: boolean) => void;
  readonly status: ReactNode;
}) => {
  const t = useT();
  const { ai, text } = flow;
  return (
    <>
      <QuickLine flow={flow} isFocused={isFocused} onFocusChange={onFocusChange} />
      {text.trim() === "" ? null : (
        <>
          {KEYBOARD === null ? null : (
            <Text className="px-2 font-sans text-[12px] text-muted">{t("composer.quickHint")}</Text>
          )}
          {/* The reading belongs to the form; at the line only what is still going on shows. */}
          {ai.state.status === "read" ? null : status}
          <QuickActions
            canParse={canAiRead(text)}
            isReading={ai.state.status === "reading"}
            onInbox={() => void flow.toInbox()}
            onParse={flow.enter}
          />
        </>
      )}
    </>
  );
};

/**
The app's entry point on Now, one card that changes shape. The line takes a task in words:
Enter has the assistant read it, and the card unfolds in place into the task form with every
field filled and labelled; a second Enter adds it. The chevron unfolds the same form by hand
(the line moves into the title). Alt+Enter keeps the raw line in the Inbox. Nothing is sent to
the assistant while typing; a paste is read at once.
*/
export const Composer = ({
  initialText = "",
  isFocused = false,
}: {
  readonly initialText?: string | undefined;
  readonly isFocused?: boolean;
}) => {
  const flow = useComposerFlow(initialText);
  const { ai, model } = flow;
  const status = (
    <AiStatus onAnswer={flow.answer} onLater={() => void flow.readLater()} state={ai.state} />
  );
  const [isLineInFocus, setIsLineInFocus] = useState(false);
  return (
    // One card that changes shape: its height follows the line or the form, and the focused
    // line rings it in the accent.
    <View
      className={cx(
        "mx-4 mb-3 rounded-xl border bg-surface p-2",
        isLineInFocus && flow.form === null ? "border-accent" : "border-line",
      )}
    >
      <AnimatedHeight>
        {/* No entering animation here: it would keep the field from taking the cursor. */}
        <View key={flow.form === null ? "line" : "form"}>
          {flow.form === null ? (
            <LineBlock
              flow={flow}
              isFocused={isFocused}
              onFocusChange={setIsLineInFocus}
              status={status}
            />
          ) : (
            <ComposerForm
              isTitleFocused
              model={model}
              onAdd={() => void flow.add()}
              onCollapse={flow.collapse}
              onEdit={(next) => {
                flow.setEdits((current) => ({ ...current, ...next }));
              }}
              status={status}
            />
          )}
        </View>
      </AnimatedHeight>
    </View>
  );
};
