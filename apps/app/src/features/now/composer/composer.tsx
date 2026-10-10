import { useRef, useState } from "react";
import { Text, TextInput, type TextInputKeyPressEvent, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { useToast } from "#app/ui/toast.tsx";
import {
  type AiOutcome,
  type AiReading,
  type Assistant,
  canAiRead,
  type ComposerEdits,
  isPasted,
  requiresAiFirst,
} from "@pace/client";
import { useAiRead } from "@pace/client/react";

import { AiStatus } from "./ai-status.tsx";
import { ComposerForm } from "./composer-form.tsx";

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
const useReadLater = (ask: () => Promise<AiOutcome>, onSaved: () => void) => {
  const t = useT();
  const toast = useToast();
  const { deviceTz } = useViewer();
  return async (): Promise<void> => {
    const outcome = await ask();
    if (outcome.status !== "queued") {
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

const MIN_INPUT_HEIGHT = 44;
/** Eight lines of 24 px and the padding: a longer message scrolls inside. */
const MAX_INPUT_HEIGHT = 212;

const heightOf = (content: number): number =>
  Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, Math.ceil(content)));

/** A keyboard (the web, a tablet with one): Enter acts, Shift+Enter starts a new line. */
const onEnter =
  (isEmpty: boolean, act: () => void) =>
  (event: TextInputKeyPressEvent): void => {
    const native = event.nativeEvent as TextInputKeyPressEvent["nativeEvent"] & {
      shiftKey?: boolean;
    };
    if (isEmpty || native.key !== "Enter" || native.shiftKey === true) {
      return;
    }
    event.preventDefault();
    act();
  };

/** Parse (the assistant), Fill in by hand (the form, empty but for the rules' reading), To Inbox. */
const QuickActions = ({
  canParse,
  isReading,
  onByHand,
  onInbox,
  onParse,
}: {
  readonly canParse: boolean;
  readonly isReading: boolean;
  readonly onParse: () => void;
  readonly onByHand: () => void;
  readonly onInbox: () => void;
}) => {
  const t = useT();
  return (
    <View className="flex-row flex-wrap gap-2 pt-2">
      <View className="min-w-36 flex-[2]">
        <Button busy={isReading} disabled={!canParse} onPress={onParse}>
          {t("composer.parse")}
        </Button>
      </View>
      {/* Wide enough for the label on one line: a narrow column wraps the button, not its text. */}
      <View className="min-w-48 flex-1">
        <Button onPress={onByHand} variant="secondary">
          {t("composer.byHand")}
        </Button>
      </View>
      <View className="min-w-36 flex-1">
        <Button onPress={onInbox} variant="ghost">
          {t("composer.toInbox")}
        </Button>
      </View>
    </View>
  );
};

/** The composer's state and moves: the text, the reading, the form, and what each key or button does. */
const useComposerFlow = (initialText: string) => {
  const { actions, assistant, hooks } = usePace();
  const run = useRunAction();
  const { ai, edits, onReading, onText, reset, setEdits, text } = useDraft(initialText, assistant);
  const model = hooks.useComposer({ edits, text });
  const [isForm, setIsForm] = useState(false);
  const previousRef = useRef(text);
  const done = (): void => {
    reset();
    setIsForm(false);
  };
  const toForm = (reading: AiReading): void => {
    onReading(reading);
    setIsForm(true);
  };
  const parse = (line: string): void => {
    void ai.read(line, toForm);
  };
  const add = async (): Promise<void> => {
    if (await run(actions.createFromComposer(model))) {
      done();
    }
  };
  return {
    add,
    ai,
    isForm,
    model,
    onText,
    parse,
    readLater: useReadLater(async () => await ai.readLater(text, toForm), done),
    setEdits,
    setIsForm,
    text,
    /** A paste is read at once; typing never is. */
    type: (next: string): void => {
      const isPaste = isPasted(previousRef.current, next) && canAiRead(next);
      previousRef.current = next;
      onText(next);
      if (isPaste) {
        parse(next);
      }
    },
    /** Enter adds a short line as it is and reads a long one into the form. */
    enter: (): void => {
      if (requiresAiFirst(text)) {
        parse(text);
      } else {
        void add();
      }
    },
    toInbox: async (): Promise<void> => {
      if (await run(actions.captureInbox(text))) {
        done();
      }
    },
  };
};

/**
The app's entry point on Now, in two steps that look different on purpose. The quick input
takes a short line (Enter adds it as it is) or a message: a paste, a long text or Parse sends
it to the assistant, whose reading opens the task form, where every field is labelled and
checked before anything is written. Nothing is sent to the assistant while typing.
*/
export const Composer = ({
  initialText = "",
  isFocused = false,
}: {
  readonly initialText?: string | undefined;
  readonly isFocused?: boolean;
}) => {
  const t = useT();
  const { palette } = useTheme();
  const flow = useComposerFlow(initialText);
  // A web textarea does not grow by itself: it takes its content's height, up to eight lines.
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  const { ai, model, text } = flow;
  const status = (
    <AiStatus
      onAnswer={(answer) => {
        flow.onText(`${text.trimEnd()} ${answer}`);
      }}
      onLater={() => void flow.readLater()}
      state={ai.state}
    />
  );
  if (flow.isForm) {
    return (
      <ComposerForm
        model={model}
        onAdd={() => void flow.add()}
        onBack={() => {
          flow.setIsForm(false);
        }}
        onEdit={(next) => {
          flow.setEdits((current) => ({ ...current, ...next }));
        }}
        status={status}
      />
    );
  }
  return (
    <View className="mx-4 mb-3 rounded-xl border border-line bg-surface p-2">
      <TextInput
        accessibilityHint={t("composer.quickHint")}
        accessibilityLabel={t("composer.label")}
        autoFocus={isFocused}
        // Grows with a pasted message up to about eight lines.
        className="mb-1 px-2 py-2.5 font-sans text-[15px] leading-6 text-fg"
        multiline
        onChangeText={flow.type}
        onContentSizeChange={(event) => {
          setInputHeight(heightOf(event.nativeEvent.contentSize.height));
        }}
        onKeyPress={onEnter(model.isEmpty, flow.enter)}
        placeholder={t("composer.placeholder")}
        placeholderTextColor={palette.muted}
        style={{ height: inputHeight }}
        textAlignVertical="top"
        value={text}
      />
      {model.isEmpty ? null : (
        <>
          <Text className="px-2 font-sans text-[12px] text-muted">{t("composer.quickHint")}</Text>
          {/* The reading belongs to the form; back at the text only what is still going on shows. */}
          {ai.state.status === "read" ? null : status}
          <QuickActions
            canParse={canAiRead(text)}
            isReading={ai.state.status === "reading"}
            onByHand={() => {
              flow.setIsForm(true);
            }}
            onInbox={() => void flow.toInbox()}
            onParse={() => {
              flow.parse(text);
            }}
          />
        </>
      )}
    </View>
  );
};
