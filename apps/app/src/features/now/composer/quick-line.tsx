import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, type TextInput, type TextInputKeyPressEvent, View } from "react-native";

import { useIsFirstSync, useT } from "#app/app-state.tsx";
import { lineEnterProps } from "#app/platform/enter-key.ts";
import { cx } from "#app/ui/cx.ts";
import { type Hotkey, HOTKEYS, labelWithHotkey } from "#app/ui/hotkeys.ts";
import { Icon, type IconName, type IconTone } from "#app/ui/icon.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { Pressable } from "#app/ui/pressable.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { Tooltip } from "#app/ui/tooltip.tsx";
import { KEYBOARD } from "#app/ui/use-hotkey.tsx";
import { typeRole } from "@pace/core";

/** What the line needs from the composer's flow. */
type LineFlow = {
  readonly text: string;
  /** The form open beside or over the line, if any. */
  readonly form: unknown;
  /** Grows each time the cursor should come back to the line. */
  readonly lineFocus: number;
  readonly type: (next: string) => void;
  readonly enter: () => void;
  /** Escape in the line: the assistant's card (or its reading) goes. */
  readonly dismiss: () => void;
  readonly expand: () => void;
  readonly toInbox: () => Promise<void>;
};

/**
The field's own text and padding: a `text-body` line (the kit `TextField`, 16 so a phone's browser
never zooms) inside a box of `py-2` and a 1 px border; the line grows from one line to eight.
*/
const LINE_PX = typeRole("body", "phone").line;
/**
The field's own `py-2`, above and below: the height set on it includes it (a web textarea is
border-box), so one line set to `LINE_PX` alone cut the placeholder in half (2026-11-09 shots).
*/
const PADDING_PX = 2 * 8;
/** One line of text. */
const MIN_INPUT_HEIGHT = LINE_PX + PADDING_PX;
/** Eight lines: a longer message scrolls inside. */
const MAX_INPUT_HEIGHT = 8 * LINE_PX + PADDING_PX;

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
Enter on an empty line does nothing at all: the browser's line break is held back too, or the
line grew into a tall empty box and the next text began with a line break (QA round 18 M2).
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
    if (native.key !== "Enter" || native.shiftKey === true) {
      return;
    }
    // Handled here: the page's own ⌘↵ (a task's Done) stays out of the line.
    event.preventDefault();
    if (isEmpty) {
      return;
    }
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
/** The line button's icon: on the accent when it is the ready action, quaternary when disabled. */
const iconTone = (isDisabled: boolean, isAccent: boolean): IconTone => {
  if (isDisabled) {
    return "quaternary";
  }
  return isAccent ? "onAccent" : "secondary";
};

const LineButton = ({
  disabled = false,
  hotkey,
  icon,
  isBusy = false,
  isAccent = false,
  label,
  onPress,
}: {
  readonly disabled?: boolean;
  readonly hotkey: Hotkey;
  readonly icon: IconName;
  readonly isBusy?: boolean;
  /** The important action, ready: on the accent. */
  readonly isAccent?: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) => {
  const { palette } = useTheme();
  const iconColor = isAccent ? palette["accent.on"] : palette["label.secondary"];
  return (
    <Tooltip label={labelWithHotkey(label, hotkey, KEYBOARD)}>
      <Pressable
        aria-busy={isBusy}
        // A 44px target around the 40px circle (hitSlop does nothing on the web, QA round 18 L6);
        // side by side they touch.
        className="h-hit-web w-hit-web items-center justify-center"
        disabled={disabled || isBusy}
        label={label}
        onPress={onPress}
        ripple="borderless"
        role="button"
        shape="pill"
      >
        <View
          className={cx(
            "h-10 w-10 items-center justify-center rounded-pill",
            isAccent && "bg-accent",
          )}
        >
          {isBusy ? (
            <ActivityIndicator aria-hidden color={iconColor} size="small" />
          ) : (
            <Icon name={icon} tone={iconTone(disabled, isAccent)} />
          )}
        </View>
      </Pressable>
    </Tooltip>
  );
};

/**
A line opened with a share takes the cursor once it can be seen (QA round 18 L2: the Enter pressed
next went nowhere), a blank share included (QA round 19 L4). `autoFocus` fires at mount, while a
fresh browser's first-sync cover still hides the app, and a hidden field takes no focus; so the
line is focused again when the cover lifts, once, and only when it opened on the line (an empty
/add opens New task's form, whose title has the cursor).
*/
const useShareFocus = (
  inputRef: RefObject<null | TextInput>,
  { isFocused, isOnLine }: { readonly isFocused: boolean; readonly isOnLine: boolean },
): void => {
  const isCovered = useIsFirstSync();
  const [opensOnLine] = useState(isOnLine);
  const isDoneRef = useRef(false);
  useEffect(() => {
    if (!isFocused || !opensOnLine || isCovered || isDoneRef.current) {
      return;
    }
    isDoneRef.current = true;
    inputRef.current?.focus();
  }, [inputRef, isCovered, isFocused, opensOnLine]);
};

/** The text itself: grows with a pasted message, takes Enter and Alt+Enter as its own. */
const LineInput = ({
  flow,
  isFocused,
  isLocked,
  isReading,
}: {
  readonly flow: LineFlow;
  readonly isFocused: boolean;
  readonly isLocked: boolean;
  readonly isReading: boolean;
}) => {
  const t = useT();
  const inputRef = useRef<TextInput>(null);
  const isEmpty = flow.text.trim() === "";
  // A web textarea does not grow by itself: it takes its content's height, up to eight lines.
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  // One function for the input's life: react-native-web measures the textarea (a forced layout)
  // each time this handler changes, which made every re-render of Now pay for a layout.
  const onContentSizeChange = useCallback(
    (event: { readonly nativeEvent: { readonly contentSize: { readonly height: number } } }) => {
      setInputHeight(heightOf(event.nativeEvent.contentSize.height));
    },
    [],
  );
  // Back at the line after adding or closing the form: the cursor goes with it.
  useEffect(() => {
    if (flow.lineFocus > 0) {
      inputRef.current?.focus();
    }
  }, [flow.lineFocus]);
  useShareFocus(inputRef, { isFocused, isOnLine: flow.form === null });
  return (
    <View className="min-w-0 flex-1">
      <TextField
        autoFocus={isFocused}
        editable={!isLocked}
        isDraft={isReading}
        isGrowing
        isLabelHidden
        label={t("composer.label")}
        onChangeText={flow.type}
        onContentSizeChange={onContentSizeChange}
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
        purpose="title"
        ref={inputRef}
        // An empty line is one line high whatever it measured before (a wrapped placeholder, a
        // long message just added): a textarea's measured height never shrinks by itself.
        style={{ height: flow.text === "" ? MIN_INPUT_HEIGHT : inputHeight }}
        value={flow.text}
      />
    </View>
  );
};

/**
The line: + (the empty form, New task), what to add, then To Inbox and Send at its right edge.
Send is on the accent once there is something to send.
*/
export const QuickLine = ({
  flow,
  isFocused,
  isLocked,
  isReading,
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
}) => {
  const t = useT();
  const isEmpty = flow.text.trim() === "";
  const isIdle = isEmpty || isLocked;
  // On a computer the sidebar's New task is the one entry to the empty form (F-CMP-18): the line
  // offers + only once it holds text to carry into the form's title.
  const isWide = useIsWide();
  return (
    <View className="flex-row items-end">
      {isWide && isEmpty ? null : (
        <View>
          <LineButton
            disabled={isLocked}
            hotkey={HOTKEYS.newTask}
            icon={"plus"}
            label={t("nav.newTask")}
            onPress={flow.expand}
          />
        </View>
      )}
      <LineInput flow={flow} isFocused={isFocused} isLocked={isLocked} isReading={isReading} />
      <View className="flex-row">
        <LineButton
          disabled={isIdle}
          hotkey={HOTKEYS.toInbox}
          icon={"inbox"}
          label={t("composer.toInbox")}
          onPress={() => void flow.toInbox()}
        />
        <LineButton
          disabled={isIdle}
          hotkey={HOTKEYS.enter}
          icon={"arrow-up"}
          isAccent={!isIdle}
          isBusy={isReading}
          label={t("composer.send")}
          onPress={flow.enter}
        />
      </View>
    </View>
  );
};
