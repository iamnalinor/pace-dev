import { ArrowUp, Inbox, type LucideIcon, Plus } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  type TextInputKeyPressEvent,
  View,
} from "react-native";

import { useT } from "#app/app-state.tsx";
import { lineEnterProps } from "#app/platform/enter-key.ts";
import { cx } from "#app/ui/cx.ts";
import { type Hotkey, HOTKEYS, labelWithHotkey } from "#app/ui/hotkeys.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { Tooltip } from "#app/ui/tooltip.tsx";
import { KEYBOARD } from "#app/ui/use-hotkey.tsx";

/** What the line needs from the composer's flow. */
type LineFlow = {
  readonly text: string;
  /** Grows each time the cursor should come back to the line. */
  readonly lineFocus: number;
  readonly type: (next: string) => void;
  readonly enter: () => void;
  /** Escape in the line: the assistant's card (or its reading) goes. */
  readonly dismiss: () => void;
  readonly expand: () => void;
  readonly toInbox: () => Promise<void>;
};

const MIN_INPUT_HEIGHT = 44;
/** Eight lines of 24 px and the padding: a longer message scrolls inside. */
const MAX_INPUT_HEIGHT = 212;

const heightOf = (content: number): number =>
  Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, Math.ceil(content)));

type KeyActions = {
  readonly enter: () => void;
  readonly toInbox: () => void;
  readonly escape: () => void;
};

/**
Enter reads the line, Alt+Enter sends it to the Inbox, Shift+Enter starts a new line; Escape
dismisses the assistant's card (the line owns its keys, so the card's own Escape never fires).
*/
const onEnter =
  (isEmpty: boolean, keys: KeyActions) =>
  (event: TextInputKeyPressEvent): void => {
    const native = event.nativeEvent as TextInputKeyPressEvent["nativeEvent"] & {
      altKey?: boolean;
      shiftKey?: boolean;
    };
    if (native.key === "Escape") {
      keys.escape();
      return;
    }
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

/**
A round icon button inside the line. Its name and its key show in a tooltip with a mouse; on a
touch screen its tap acts at once (the screen changes, there is nothing to wait for).
*/
const LineButton = ({
  disabled = false,
  hotkey,
  icon: Icon,
  isBusy = false,
  isLime = false,
  label,
  onPress,
}: {
  readonly disabled?: boolean;
  readonly hotkey: Hotkey;
  readonly icon: LucideIcon;
  readonly isBusy?: boolean;
  /** The important action, ready: in the lime accent. */
  readonly isLime?: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) => {
  const { palette } = useTheme();
  const iconColor = isLime ? palette.accentFg : palette.fg2;
  return (
    <Tooltip label={labelWithHotkey(label, hotkey, KEYBOARD)} showsOnTap={false}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        aria-busy={isBusy}
        aria-disabled={disabled}
        className={cx(
          "h-9 w-9 items-center justify-center rounded-full active:opacity-70",
          isLime && "bg-accent",
        )}
        disabled={disabled || isBusy}
        hitSlop={4}
        onPress={onPress}
      >
        {isBusy ? (
          <ActivityIndicator color={iconColor} size="small" />
        ) : (
          <Icon
            color={disabled ? palette.faint : iconColor}
            size={18}
            strokeWidth={isLime ? 2.25 : 1.75}
          />
        )}
      </Pressable>
    </Tooltip>
  );
};

/** The text itself: grows with a pasted message, takes Enter and Alt+Enter as its own. */
const LineInput = ({
  flow,
  isFocused,
  isLocked,
  onFocusChange,
}: {
  readonly flow: LineFlow;
  readonly isFocused: boolean;
  readonly isLocked: boolean;
  readonly onFocusChange: (isInFocus: boolean) => void;
}) => {
  const t = useT();
  const { palette } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const isEmpty = flow.text.trim() === "";
  // A web textarea does not grow by itself: it takes its content's height, up to eight lines.
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  // Back at the line after adding or closing the form: the cursor goes with it.
  useEffect(() => {
    if (flow.lineFocus > 0) {
      inputRef.current?.focus();
    }
  }, [flow.lineFocus]);
  return (
    <TextInput
      accessibilityLabel={t("composer.label")}
      autoFocus={isFocused}
      className={cx(
        "flex-1 px-1.5 py-2.5 font-sans text-[15px] leading-6",
        isLocked ? "text-muted" : "text-fg",
      )}
      editable={!isLocked}
      multiline
      onBlur={() => {
        onFocusChange(false);
      }}
      onChangeText={flow.type}
      onContentSizeChange={(event) => {
        setInputHeight(heightOf(event.nativeEvent.contentSize.height));
      }}
      onFocus={() => {
        onFocusChange(true);
      }}
      // Locked, its keys are not its own: Escape reaches the form beside it.
      {...(!isLocked &&
        lineEnterProps({
          onEnter: () => {
            if (!isEmpty) {
              flow.enter();
            }
          },
          onKeyPress: onEnter(isEmpty, {
            enter: flow.enter,
            escape: flow.dismiss,
            toInbox: () => void flow.toInbox(),
          }),
        }))}
      placeholder={t("composer.placeholder")}
      placeholderTextColor={palette.muted}
      ref={inputRef}
      // An empty line is one line high whatever it measured before (a wrapped placeholder, a
      // long message just added): a textarea's measured height never shrinks by itself.
      style={{ height: flow.text === "" ? MIN_INPUT_HEIGHT : inputHeight }}
      textAlignVertical="top"
      value={flow.text}
    />
  );
};

/**
The line: + (the empty form, New task), what to add, then To Inbox and Send at its right edge.
Send is lime once there is something to send.
*/
export const QuickLine = ({
  flow,
  isFocused,
  isLocked,
  isReading,
  onFocusChange,
}: {
  readonly flow: LineFlow;
  readonly isFocused: boolean;
  /**
  The form beside it (Now's right pane) holds the draft: the line shows it but takes no keys
  and no presses, so the draft is changed in one place only.
  */
  readonly isLocked: boolean;
  /** The assistant is reading the line: Send spins. */
  readonly isReading: boolean;
  /** The card shows a focus ring while the cursor is in the line. */
  readonly onFocusChange: (isInFocus: boolean) => void;
}) => {
  const t = useT();
  const isEmpty = flow.text.trim() === "";
  const isIdle = isEmpty || isLocked;
  return (
    <View className="flex-row items-end gap-0.5">
      <View className="mb-1">
        <LineButton
          disabled={isLocked}
          hotkey={HOTKEYS.newTask}
          icon={Plus}
          label={t("nav.newTask")}
          onPress={flow.expand}
        />
      </View>
      <LineInput
        flow={flow}
        isFocused={isFocused}
        isLocked={isLocked}
        onFocusChange={onFocusChange}
      />
      <View className="mb-1 flex-row gap-0.5">
        <LineButton
          disabled={isIdle}
          hotkey={HOTKEYS.toInbox}
          icon={Inbox}
          label={t("composer.toInbox")}
          onPress={() => void flow.toInbox()}
        />
        <LineButton
          disabled={isIdle}
          hotkey={HOTKEYS.enter}
          icon={ArrowUp}
          isBusy={isReading}
          isLime={!isIdle}
          label={t("composer.send")}
          onPress={flow.enter}
        />
      </View>
    </View>
  );
};
