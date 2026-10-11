import { ChevronDown } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, Text, TextInput, type TextInputKeyPressEvent, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { Expandable } from "#app/ui/expandable.tsx";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { useToast } from "#app/ui/toast.tsx";
import { KEYBOARD, useHotkey } from "#app/ui/use-hotkey.tsx";
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

const MIN_INPUT_HEIGHT = 44;
/** Eight lines of 24 px and the padding: a longer message scrolls inside. */
const MAX_INPUT_HEIGHT = 212;

const heightOf = (content: number): number =>
  Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, Math.ceil(content)));

type KeyActions = { readonly enter: () => void; readonly toInbox: () => void };

/** Enter reads the line, Alt+Enter sends it to the Inbox, Shift+Enter starts a new line. */
const onEnter =
  (isEmpty: boolean, keys: KeyActions) =>
  (event: TextInputKeyPressEvent): void => {
    const native = event.nativeEvent as TextInputKeyPressEvent["nativeEvent"] & {
      altKey?: boolean;
      shiftKey?: boolean;
    };
    if (isEmpty || native.key !== "Enter" || native.shiftKey === true) {
      return;
    }
    // Handled here: the page's own ⌘↵ (a task's Done) stays out of the line.
    event.preventDefault();
    if (native.altKey === true) {
      keys.toInbox();
    } else {
      keys.enter();
    }
  };

/** Parse (Enter) and To Inbox (Alt+Enter), with their keys shown on a computer. */
const QuickActions = ({
  canParse,
  isReading,
  onInbox,
  onParse,
}: {
  readonly canParse: boolean;
  readonly isReading: boolean;
  readonly onParse: () => void;
  readonly onInbox: () => void;
}) => {
  const t = useT();
  return (
    <View className="flex-row flex-wrap gap-2 pt-2">
      <View className="min-w-36 flex-[2]">
        <Button
          busy={isReading}
          disabled={!canParse}
          hotkey={HOTKEYS.enter}
          hotkeyMode="hint"
          onPress={onParse}
        >
          {t("composer.parse")}
        </Button>
      </View>
      <View className="min-w-36 flex-1">
        <Button hotkey={HOTKEYS.toInbox} hotkeyMode="hint" onPress={onInbox} variant="ghost">
          {t("composer.toInbox")}
        </Button>
      </View>
    </View>
  );
};

/** The composer's state and moves: the text, the reading, the form, and what each key does. */
const useComposerFlow = (initialText: string) => {
  const { actions, assistant, hooks } = usePace();
  const run = useRunAction();
  const { ai, edits, onReading, onText, reset, setEdits, text } = useDraft(initialText, assistant);
  const model = hooks.useComposer({ edits, text });
  const [form, setForm] = useState<"by-hand" | "read" | null>(null);
  const [isAdded, setIsAdded] = useState(false);
  const previousRef = useRef(text);
  const done = (): void => {
    reset();
    setForm(null);
    setIsAdded(true);
  };
  /** The assistant's reading (or, when it cannot read, the rules') unfolds the form. */
  const parse = async (line: string): Promise<void> => {
    const outcome = await ai.read(line, onReading);
    if (outcome !== null && outcome.status !== "queued") {
      setForm("read");
    }
  };
  const add = async (): Promise<void> => {
    const isReadByAssistant = ai.state.status === "read";
    if (await run(actions.createFromComposer(model, { readByAssistant: isReadByAssistant }))) {
      done();
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
    },
    /** Enter: the assistant reads the line into the form; a line too short to read opens it as is. */
    enter: (): void => {
      if (canAiRead(text)) {
        void parse(text);
      } else {
        setForm("read");
      }
    },
    expand: (): void => {
      setForm("by-hand");
    },
    form,
    isAdded,
    model,
    onText,
    readLater: useReadLater(async () => await ai.readLater(text, onReading), done),
    setEdits,
    text,
    toInbox,
    /** A paste is read at once; typing never is. */
    type: (next: string): void => {
      const isPaste = isPasted(previousRef.current, next) && canAiRead(next);
      previousRef.current = next;
      onText(next);
      if (isPaste) {
        void parse(next);
      }
    },
  };
};

type Flow = ReturnType<typeof useComposerFlow>;

/** The line: what to add, the chevron that unfolds the form by hand; N puts the cursor here. */
const QuickLine = ({ flow, isFocused }: { readonly flow: Flow; readonly isFocused: boolean }) => {
  const t = useT();
  const { palette } = useTheme();
  const inputRef = useRef<TextInput>(null);
  // A web textarea does not grow by itself: it takes its content's height, up to eight lines.
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  useHotkey(HOTKEYS.newTask, () => {
    inputRef.current?.focus();
  });
  return (
    <View className="flex-row items-start">
      <TextInput
        accessibilityHint={t("composer.quickHint")}
        accessibilityLabel={t("composer.label")}
        autoFocus={isFocused || flow.isAdded}
        // Grows with a pasted message up to about eight lines.
        className="mb-1 flex-1 px-2 py-2.5 font-sans text-[15px] leading-6 text-fg"
        multiline
        onChangeText={flow.type}
        onContentSizeChange={(event) => {
          setInputHeight(heightOf(event.nativeEvent.contentSize.height));
        }}
        onKeyPress={onEnter(flow.model.isEmpty, {
          enter: flow.enter,
          toInbox: () => void flow.toInbox(),
        })}
        placeholder={t("composer.placeholder")}
        placeholderTextColor={palette.muted}
        ref={inputRef}
        style={{ height: inputHeight }}
        textAlignVertical="top"
        value={flow.text}
      />
      <Pressable
        accessibilityLabel={t("composer.expand")}
        accessibilityRole="button"
        aria-expanded={false}
        className="h-11 w-11 items-center justify-center rounded-md active:opacity-70"
        onPress={flow.expand}
      >
        <ChevronDown color={palette.muted} size={18} strokeWidth={2} />
      </Pressable>
    </View>
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
  const t = useT();
  const flow = useComposerFlow(initialText);
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
  return (
    <View className="mx-4 mb-3 rounded-xl border border-line bg-surface p-2">
      {flow.form === null ? (
        <>
          <QuickLine flow={flow} isFocused={isFocused} />
          {model.isEmpty ? null : (
            <>
              {KEYBOARD === null ? null : (
                <Text className="px-2 font-sans text-[12px] text-muted">
                  {t("composer.quickHint")}
                </Text>
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
      ) : null}
      <Expandable isOpen={flow.form !== null}>
        <ComposerForm
          isTitleFocused={flow.form === "by-hand"}
          model={model}
          onAdd={() => void flow.add()}
          onCollapse={flow.collapse}
          onEdit={(next) => {
            flow.setEdits((current) => ({ ...current, ...next }));
          }}
          status={status}
        />
      </Expandable>
    </View>
  );
};
