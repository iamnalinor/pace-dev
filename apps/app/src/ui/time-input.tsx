import { type Ref, type RefObject, useCallback, useEffect, useId, useRef, useState } from "react";
import { TextInput, View } from "react-native";

import { typeTime } from "@pace/client";

import { useT } from "../app-state.tsx";
import { submitFieldProps } from "../platform/enter-key.ts";
import { cx } from "./cx.ts";
import { ErrorMessage } from "./field-error.tsx";
import { useSheetSubmit } from "./sheet-submit.tsx";
import { boxClass, FocusRing } from "./text-field.tsx";
import { useTheme } from "./theme-provider.tsx";
import { useTimeCheck } from "./time-check.tsx";

/**
How long a typed time may get: room for a paste the parser reads whole («9:30 PM», «12:345» are
refused as typed rather than cut to a wrong time by the browser).
*/
export const TIME_MAX_LENGTH = 8;

/**
A Save around the field asks first: typed text that is not a time (in a draft, not the time the
draft holds either: «0:30» on the way to retyping the hour) refuses it, and the field says why
(QA round 27 R27-02).
*/
const useUnreadableCheck = (
  pendingRef: RefObject<null | string>,
  latestRef: RefObject<{ readonly isDraft: boolean }>,
  setIsWrong: (isWrong: boolean) => void,
): void => {
  useTimeCheck(
    useCallback(() => {
      const typed = pendingRef.current;
      if (typed === null) {
        return false;
      }
      const read = typeTime(typed);
      const isUnreadable = !read.isComplete || (latestRef.current.isDraft && read.text !== typed);
      if (isUnreadable) {
        setIsWrong(true);
      }
      return isUnreadable;
    }, [latestRef, pendingRef, setIsWrong]),
  );
};

/** While untouched, the field shows the stored value as it changes (synced, a row above removed; I5). */
const useStoredValue = (
  value: string,
  isEdited: boolean,
  setText: (text: string) => void,
): void => {
  const [shown, setShown] = useState(value);
  if (shown === value) {
    return;
  }

  setShown(value);
  if (!isEdited) {
    setText(value);
  }
};

/**
The typed text of a `TimeInput` and when it is saved: on leave or Enter (`isCommitted`), as it is typed
inside a draft, and as the field goes away holding a time it was not left with.
*/
const useTypedTime = ({
  isDraft,
  onTime,
  value,
}: {
  readonly isDraft: boolean;
  readonly onTime: (time: string) => void;
  readonly value: string;
}) => {
  const [text, setText] = useState(value);
  const [isWrong, setIsWrong] = useState(false);
  // Only what the person typed is saved: a field left untouched shows the stored time again,
  // so a time changed elsewhere meanwhile is never written back over.
  const [isEdited, setIsEdited] = useState(false);
  useStoredValue(value, isEdited, setText);
  // What an unmount must still save: the text typed and not yet saved, and who hears it.
  const pendingRef = useRef<null | string>(null);
  const latestRef = useRef({ isDraft, onTime, value });
  useEffect(() => {
    latestRef.current = { isDraft, onTime, value };
  });
  useEffect(
    () => () => {
      // A draft has every complete time already; what is left in it is not one.
      if (pendingRef.current === null || latestRef.current.isDraft) {
        return;
      }
      const read = typeTime(pendingRef.current);
      if (read.isComplete && read.text !== latestRef.current.value) {
        latestRef.current.onTime(read.text);
      }
    },
    [],
  );
  useUnreadableCheck(pendingRef, latestRef, setIsWrong);
  /** Saves what is typed; `true` when the stored time already is what the field shows. */
  const isCommitted = (): boolean => {
    if (!isEdited) {
      setText(value);
      return true;
    }
    const read = typeTime(text);
    if (!read.isComplete) {
      setIsWrong(true);
      return false;
    }
    pendingRef.current = null;
    setIsWrong(false);
    setIsEdited(false);
    setText(read.text);
    if (read.text !== value) {
      onTime(read.text);
      return false;
    }
    return true;
  };
  const type = (raw: string): void => {
    const typed = typeTime(raw, text);
    setIsEdited(true);
    setText(typed.text);
    pendingRef.current = typed.text;
    if (isDraft && typed.isComplete && typed.text !== value) {
      onTime(typed.text);
    }
  };
  return { isCommitted, isWrong, text, type };
};

/**
An `HH:MM` field typed as digits (the colon comes by itself; spec §4.2.29, the time purpose of the
kit's field). The text stays local while it is typed; `onTime` hears the time when the person
leaves the field or presses Enter, read whole, and only when it is a time that differs from the
stored one: a stored time never holds "1" or "14:", and an edit in the middle of a filled value
(the hour deleted to retype it) never writes a wrong time on the way (QA-25 review I1). Left
with a text that is not a time, the field keeps it and says so under itself, as Day's sheet does
(R26-05). It wears the field's states (the focus ring on focus, the danger border, the disabled
look) on the same box as `TextField`, and is as wide as its content (F-LAY-09), unless the
caller sizes it.

A field can go away without being left: on Android a tap on Done or Save under
`keyboardShouldPersistTaps="handled"` blurs nothing, so a typed time that is complete is saved
as the field unmounts too (review I1), read whole as on leave. Inside a draft that a Save or Done writes later (`isDraft`),
each complete time is handed over as it is typed, so such a tap finds it in the draft already; a
deletion's reading («0:30» on the way to retyping the hour) is never complete, so nothing wrong
goes in. While untouched it shows the stored value as it changes (synced, or a row above removed;
review I5).
*/
export const TimeInput = ({
  className,
  editable = true,
  isDraft = false,
  label,
  onTime,
  ref,
  value,
}: {
  readonly className?: string;
  readonly editable?: boolean;
  /** The caller keeps a draft that its own Save or Done writes: hand every complete time over. */
  readonly isDraft?: boolean;
  readonly label: string;
  readonly onTime: (time: string) => void;
  readonly ref?: Ref<TextInput> | undefined;
  readonly value: string;
}) => {
  const { palette } = useTheme();
  const t = useT();
  const messageId = useId();
  const [isFocused, setIsFocused] = useState(false);
  const { isCommitted, isWrong, text, type } = useTypedTime({ isDraft, onTime, value });
  const sheetSubmit = useSheetSubmit();
  return (
    <View className={cx("gap-2 self-start", className)}>
      <View className={boxClass({ isDisabled: !editable, isErrored: isWrong, multiline: false })}>
        {isFocused ? <FocusRing /> : null}
        <TextInput
          accessibilityLabel={label}
          aria-describedby={isWrong ? messageId : undefined}
          aria-invalid={isWrong}
          autoComplete="off"
          className={cx(
            "min-w-0 flex-1 py-2 font-sans text-body tabular-nums",
            editable ? "text-label-primary" : "text-label-quaternary",
          )}
          editable={editable}
          inputMode="numeric"
          maxLength={TIME_MAX_LENGTH}
          onBlur={() => {
            setIsFocused(false);
            isCommitted();
          }}
          {...(sheetSubmit !== undefined && submitFieldProps)}
          onChangeText={type}
          onFocus={() => {
            setIsFocused(true);
          }}
          onSubmitEditing={() => {
            // In a sheet Enter presses its Done or Save, as in its other fields (R27-01), once the
            // form holds the time shown; a time just handed over waits for the next Enter.
            if (isCommitted()) {
              sheetSubmit?.();
            }
          }}
          placeholder="00:00"
          placeholderTextColor={palette["label.tertiary"]}
          ref={ref}
          value={text}
        />
      </View>
      {isWrong ? <ErrorMessage error={t("day.badTime")} id={messageId} /> : null}
    </View>
  );
};
