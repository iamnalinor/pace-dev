import { ChevronDown } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, TextInput, type TextInputKeyPressEvent, View } from "react-native";

import type { ComposerModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { lineEnterProps } from "#app/platform/enter-key.ts";
import { Button } from "#app/ui/button.tsx";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { KEYBOARD, useHotkey } from "#app/ui/use-hotkey.tsx";

/** What the line needs from the composer's flow. */
type LineFlow = {
  readonly text: string;
  readonly model: Pick<ComposerModel, "isEmpty">;
  readonly isAdded: boolean;
  readonly type: (next: string) => void;
  readonly enter: () => void;
  readonly expand: () => void;
  readonly toInbox: () => Promise<void>;
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
export const QuickActions = ({
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

/** The line: what to add, the chevron that unfolds the form by hand; N puts the cursor here. */
export const QuickLine = ({
  flow,
  isFocused,
}: {
  readonly flow: LineFlow;
  readonly isFocused: boolean;
}) => {
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
        {...(KEYBOARD !== null && { accessibilityHint: t("composer.quickHint") })}
        accessibilityLabel={t("composer.label")}
        autoFocus={isFocused || flow.isAdded}
        // Grows with a pasted message up to about eight lines.
        className="mb-1 flex-1 px-2 py-2.5 font-sans text-[15px] leading-6 text-fg"
        multiline
        onChangeText={flow.type}
        onContentSizeChange={(event) => {
          setInputHeight(heightOf(event.nativeEvent.contentSize.height));
        }}
        {...lineEnterProps({
          onEnter: () => {
            if (!flow.model.isEmpty) {
              flow.enter();
            }
          },
          onKeyPress: onEnter(flow.model.isEmpty, {
            enter: flow.enter,
            toInbox: () => void flow.toInbox(),
          }),
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
