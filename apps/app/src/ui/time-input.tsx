import { type Ref, type RefObject, useCallback, useEffect, useId, useRef, useState } from "react";
import { TextInput, View } from "react-native";

import { readTime, typeTime } from "@pace/client";

import { useT } from "../app-state.tsx";
import { submitFieldProps } from "../platform/enter-key.ts";
import { cx } from "./cx.ts";
import { ErrorMessage } from "./field-error.tsx";
import { FieldLabel } from "./field-label.tsx";
import { useIsScreenActive } from "./screen-active.ts";
import { useSheetSubmit } from "./sheet-submit.tsx";
import { boxClass, FocusRing } from "./text-field.tsx";
import { useTheme } from "./theme-provider.tsx";
import { type TimeVerdict, useTimeCheck } from "./time-check.tsx";

/**
How long a typed time may get: room for a paste the parser reads whole («9:30 PM», «12:345» are
refused as typed rather than cut to a wrong time by the browser).
*/
export const TIME_MAX_LENGTH = 8;

/**
A Save around the field asks first: typed text that is not a time (in a draft, not the time the
draft holds either: «0:30» on the way to retyping the hour) refuses it, and the field says why
(QA round 27 R27-02). A time the field hands over to the draft for that press («7» read whole is
07:00), or handed over a moment ago and not yet drawn (Enter), makes the press wait for the render
that gives the form the time; the form then runs it again (`useCheckedSubmit`, review I3).
*/
const useUnreadableCheck = (
  refs: {
    readonly pendingRef: RefObject<null | string>;
    readonly handedRef: RefObject<boolean>;
    readonly latestRef: RefObject<{
      readonly isDraft: boolean;
      readonly onTime: (time: string) => void;
    }>;
  },
  setters: {
    readonly setIsWrong: (isWrong: boolean) => void;
    /** Shows a text as the one typed, still to be saved. */
    readonly adopt: (text: string) => void;
  },
): void => {
  const { handedRef, latestRef, pendingRef } = refs;
  const { adopt, setIsWrong } = setters;
  useTimeCheck(
    useCallback(
      (canHandOver: boolean): TimeVerdict => {
        if (handedRef.current || pendingRef.current === null) {
          // Handed over a moment ago: once only, the press's next run finds it drawn.
          const verdict = handedRef.current ? "waits" : "read";
          handedRef.current = false;
          return verdict;
        }
        const typed = pendingRef.current;
        const read = readTime(typed);
        if (!read.isComplete) {
          setIsWrong(true);
          return "wrong";
        }
        if (!latestRef.current.isDraft || read.text === typed) {
          return "read";
        }
        if (canHandOver) {
          // Read whole it is a time the draft does not hold yet («7» is 07:00): handed over and
          // shown; the press runs again once the form has it.
          adopt(read.text);
          latestRef.current.onTime(read.text);
        }
        return "waits";
      },
      [adopt, handedRef, latestRef, pendingRef, setIsWrong],
    ),
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
Left behind (another tab; the screen stays mounted) holding text that is not a time, a field that
writes on its own shows the stored time again: the person comes back to what is stored, not to an
error they left (QA round 28 R28-10).
*/
const useDroppedOnLeave = (isUnsaved: boolean, drop: () => void): void => {
  const isActive = useIsScreenActive();
  const [wasActive, setWasActive] = useState(isActive);
  if (wasActive === isActive) {
    return;
  }
  setWasActive(isActive);
  if (!isActive && isUnsaved) {
    drop();
  }
};

/**
The typed text of a `TimeInput` and when it is saved: on leave or Enter (`commit`), as it is typed
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
  useDroppedOnLeave(!isDraft && isWrong, () => {
    setText(value);
    setIsWrong(false);
    setIsEdited(false);
  });
  // What an unmount must still save: the text typed and not yet saved, and who hears it.
  const pendingRef = useRef<null | string>(null);
  // A time handed to `onTime` that the caller has not drawn yet: a Save pressed now waits for it.
  const handedRef = useRef(false);
  const latestRef = useRef({ isDraft, onTime, value });
  useEffect(() => {
    latestRef.current = { isDraft, onTime, value };
    handedRef.current = false;
  });
  useEffect(
    () => () => {
      // A draft has every complete time already; what is left in it is not one.
      if (pendingRef.current === null || latestRef.current.isDraft) {
        return;
      }
      const read = readTime(pendingRef.current);
      if (read.isComplete && read.text !== latestRef.current.value) {
        latestRef.current.onTime(read.text);
      }
    },
    [],
  );
  const adopt = useCallback((typed: string) => {
    pendingRef.current = typed;
    setText(typed);
  }, []);
  useUnreadableCheck({ handedRef, latestRef, pendingRef }, { adopt, setIsWrong });
  /** Saves what is typed, read whole; a text that is not a time stays, said wrong. */
  const commit = (): void => {
    if (!isEdited) {
      setText(value);
      return;
    }
    const read = readTime(text);
    if (!read.isComplete) {
      setIsWrong(true);
      return;
    }
    pendingRef.current = null;
    setIsWrong(false);
    setIsEdited(false);
    setText(read.text);
    if (read.text === value) {
      return;
    }

    handedRef.current = true;
    onTime(read.text);
  };
  const type = (raw: string): void => {
    const typed = typeTime(raw, text);
    setIsEdited(true);
    setText(typed.text);
    pendingRef.current = typed.text;
    if (!(isDraft && typed.isComplete) || typed.text === value) {
      return;
    }

    handedRef.current = true;
    onTime(typed.text);
  };
  return { commit, isWrong, text, type };
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
caller sizes it. `isLabelShown` draws its label above it as `TextField` does, so a time beside a
labelled date lines up with it (the Close sheet's «Время» sat 25 px above «Дата», unnamed: R28-08).

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
  isLabelShown = false,
  label,
  onTime,
  ref,
  value,
}: {
  readonly className?: string;
  readonly editable?: boolean;
  /** The caller keeps a draft that its own Save or Done writes: hand every complete time over. */
  readonly isDraft?: boolean;
  /** Its label in words above it (`FieldLabel`), not only to a screen reader. */
  readonly isLabelShown?: boolean;
  readonly label: string;
  readonly onTime: (time: string) => void;
  readonly ref?: Ref<TextInput> | undefined;
  readonly value: string;
}) => {
  const { palette } = useTheme();
  const t = useT();
  const messageId = useId();
  const fieldId = useId();
  const [isFocused, setIsFocused] = useState(false);
  const { commit, isWrong, text, type } = useTypedTime({ isDraft, onTime, value });
  const sheetSubmit = useSheetSubmit();
  return (
    <View className={cx("gap-2 self-start", className)}>
      {isLabelShown ? <FieldLabel fieldId={fieldId} isDisabled={!editable} text={label} /> : null}
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
          id={fieldId}
          inputMode="numeric"
          maxLength={TIME_MAX_LENGTH}
          nativeID={fieldId}
          onBlur={() => {
            setIsFocused(false);
            commit();
          }}
          {...(sheetSubmit !== undefined && submitFieldProps)}
          onChangeText={type}
          onFocus={() => {
            setIsFocused(true);
          }}
          onSubmitEditing={() => {
            // In a sheet Enter presses its Done or Save, as in its other fields (R27-01). A time
            // just handed over is saved by that same press: it waits for the render that has it.
            commit();
            sheetSubmit?.();
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
