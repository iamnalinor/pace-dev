import { type Ref, useId, useState } from "react";
import { Text, TextInput, type TextInputProps, View } from "react-native";

import { typeRole } from "@pace/core";

import { submitFieldProps } from "../platform/enter-key.ts";
import { cx } from "./cx.ts";
import { FieldLabel } from "./field-label.tsx";
import { Icon } from "./icon.tsx";
import { useSheetSubmit } from "./sheet-submit.tsx";
import { useTheme } from "./theme-provider.tsx";

/**
What a field holds (spec §4.2.28, §7 Fields): one prop sets the keyboard, the browser's attributes
and the Enter key. `title` a task or a thing's name (sentences, spell-checked, Enter is done);
`text` plain words; `description` many lines; `name` a person's or a device's name; `url` an
address (no spell check, no capitals); `search` (a leading search glyph); `number`; `token` a code
copied in as it is.
*/
export type FieldPurpose =
  | "description"
  | "name"
  | "number"
  | "search"
  | "text"
  | "title"
  | "token"
  | "url";

/** The platform attributes a purpose sets (`autocomplete="off"` on every non-auth field, F-WEB-08). */
export const PURPOSE_PROPS: Readonly<Record<FieldPurpose, TextInputProps>> = {
  description: { autoCapitalize: "sentences", autoComplete: "off", spellCheck: true },
  name: { autoCapitalize: "words", autoComplete: "off", enterKeyHint: "done", spellCheck: false },
  number: { autoComplete: "off", enterKeyHint: "done", inputMode: "decimal", spellCheck: false },
  search: { autoComplete: "off", enterKeyHint: "search", inputMode: "search", spellCheck: false },
  text: { autoCapitalize: "sentences", autoComplete: "off", enterKeyHint: "done" },
  title: {
    autoCapitalize: "sentences",
    autoComplete: "off",
    enterKeyHint: "done",
    spellCheck: true,
  },
  token: {
    autoCapitalize: "none",
    autoComplete: "off",
    autoCorrect: false,
    enterKeyHint: "done",
    spellCheck: false,
  },
  url: {
    autoCapitalize: "none",
    autoComplete: "url",
    autoCorrect: false,
    enterKeyHint: "go",
    inputMode: "url",
    spellCheck: false,
  },
};

/**
When the error is shown (the touched gate, F-CMP-03): `touched` once the field has been left or a
submit was tried, `submitted` only after a submit was tried. Without it the error shows as given:
the caller gates it itself (a refusal from the server, a save that was tried).
*/
export type ShowErrorWhen = "submitted" | "touched";

/** Whether the error is due, by the gate. */
export const isErrorShown = ({
  error,
  isSubmitted,
  isTouched,
  showErrorWhen,
}: {
  readonly error: null | string | undefined;
  readonly isSubmitted: boolean;
  readonly isTouched: boolean;
  readonly showErrorWhen: ShowErrorWhen | undefined;
}): boolean => {
  if (error === null || error === undefined || error === "") {
    return false;
  }
  if (showErrorWhen === undefined) {
    return true;
  }
  return isSubmitted || (showErrorWhen === "touched" && isTouched);
};

/** The field's frame: rest, focused (the ring), errored, disabled (spec §4.2.28 states). */
export const boxClass = ({
  isDisabled,
  isErrored,
  multiline,
}: {
  readonly isDisabled: boolean;
  readonly isErrored: boolean;
  readonly multiline: boolean;
}): string =>
  cx(
    "relative flex-row items-center gap-2 rounded-md px-4",
    multiline ? "min-h-24 py-3" : "min-h-hit lg:min-h-hit-web",
    isDisabled ? "bg-fill-1" : "border bg-cell",
    !isDisabled && (isErrored ? "border-danger" : "border-outline"),
  );

/** The ring of a focused field (any input method, not only the keyboard's; F-A11Y-01): 2 + 2 px. */
export const FocusRing = () => (
  <View
    className="absolute -inset-1 rounded-lg border-2 border-focus"
    pointerEvents="none"
    testID="text-field-ring"
  />
);

/** The error under the field, with its glyph, announced once (polite). */
const ErrorMessage = ({ error, id }: { readonly error: string; readonly id: string }) => (
  <View className="flex-row items-start gap-1" nativeID={id} testID="text-field-message">
    <Icon name="triangle-alert" size="inline" tone="danger" />
    <Text
      accessibilityLiveRegion="polite"
      className="shrink font-sans text-footnote text-danger"
      role="alert"
    >
      {error}
    </Text>
  </View>
);

/** The hint under the field. */
const HintMessage = ({ hint, id }: { readonly hint: string; readonly id: string }) => (
  <Text className="font-sans text-footnote text-label-secondary" nativeID={id}>
    {hint}
  </Text>
);

export type TextFieldProps = Omit<
  TextInputProps,
  "accessibilityLabel" | "className" | "multiline" | "placeholderTextColor"
> & {
  readonly ref?: Ref<TextInput> | undefined;
  /** The visible label; it names the field (a web `<label for>`). */
  readonly label: string;
  readonly purpose?: FieldPurpose | undefined;
  readonly error?: null | string | undefined;
  readonly showErrorWhen?: ShowErrorWhen | undefined;
  /** A submit was tried: the gate lets the error through. */
  readonly isSubmitted?: boolean | undefined;
  readonly hint?: string | undefined;
  /** Grows from 3 lines to 8, then scrolls (implied by `purpose="description"`). */
  readonly multiline?: boolean | undefined;
  /**
  The label names the field without showing (a search field whose placeholder says what it is):
  use it only where the field's purpose reads from the screen around it.
  */
  readonly isLabelHidden?: boolean | undefined;
  /** The value cannot be read, said by the danger border alone (the message sits elsewhere). */
  readonly isInvalid?: boolean | undefined;
};

/** A multiline field grows to 8 lines of `body`, then scrolls (spec §4.2.28). */
const MULTILINE_MAX = { maxHeight: typeRole("body", "phone").line * 8 } as const;

/** The field's own state: focused (the ring), touched (the gate), and its two ids. */
const useFieldState = ({ onBlur, onFocus }: Pick<TextInputProps, "onBlur" | "onFocus">) => {
  const [isTouched, setIsTouched] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  return {
    fieldId: useId(),
    isFocused,
    isTouched,
    messageId: useId(),
    onBlur: ((event) => {
      setIsTouched(true);
      setIsFocused(false);
      onBlur?.(event);
    }) satisfies TextInputProps["onBlur"],
    onFocus: ((event) => {
      setIsFocused(true);
      onFocus?.(event);
    }) satisfies TextInputProps["onFocus"],
  };
};

/**
What the input takes beyond the caller's own props: the purpose's attributes, the label as its
name, the message as its description, and Enter. In a sheet, a single-line field's Enter is the
form's action (or the caller's own submit), and the cursor stays (QA round 21 M1).
*/
const inputPropsOf = ({
  describedBy,
  isMultiline,
  isShown,
  onSubmitEditing,
  purpose,
  submit,
}: {
  readonly describedBy: string | undefined;
  readonly isMultiline: boolean;
  readonly isShown: boolean;
  readonly onSubmitEditing: TextInputProps["onSubmitEditing"];
  readonly purpose: FieldPurpose;
  readonly submit: (() => void) | undefined;
}): TextInputProps & {
  readonly "aria-describedby"?: string | undefined;
  readonly "aria-invalid"?: boolean;
} => {
  const isSheetEnter = submit !== undefined && !isMultiline;
  return {
    ...PURPOSE_PROPS[purpose],
    ...(isSheetEnter && submitFieldProps),
    "aria-describedby": describedBy,
    "aria-invalid": isShown,
    multiline: isMultiline,
    onSubmitEditing: onSubmitEditing ?? (isSheetEnter ? submit : undefined),
    textAlignVertical: isMultiline ? "top" : "center",
    ...(isMultiline && { numberOfLines: 3, style: MULTILINE_MAX }),
  };
};

/** The props with their defaults: what the field reads before it draws. */
const withDefaults = ({
  editable = true,
  isInvalid = false,
  isLabelHidden = false,
  isSubmitted = false,
  multiline = false,
  purpose = "text",
  ...rest
}: Omit<TextFieldProps, "onBlur" | "onFocus">) => ({
  ...rest,
  editable,
  isInvalid,
  isLabelHidden,
  isSubmitted,
  // A description is many lines whoever asks.
  isMultiline: multiline || purpose === "description",
  purpose,
});

/** The error the gate lets through now, or null. */
const shownErrorOf = (
  { error, isSubmitted, showErrorWhen }: ReturnType<typeof withDefaults>,
  isTouched: boolean,
): null | string =>
  isErrorShown({ error, isSubmitted, isTouched, showErrorWhen }) ? (error ?? null) : null;

/** Under the field: the error, or else the hint, or nothing. */
const FieldMessage = ({
  error,
  hint,
  id,
}: {
  readonly error: null | string;
  readonly hint: string | undefined;
  readonly id: string;
}) => (
  <>
    {error === null ? null : <ErrorMessage error={error} id={id} />}
    {error === null && hint !== undefined ? <HintMessage hint={hint} id={id} /> : null}
  </>
);

/** Inside the box, before the text: the ring while focused, the search glyph for a search. */
const Adornments = ({
  isFocused,
  purpose,
}: {
  readonly isFocused: boolean;
  readonly purpose: FieldPurpose;
}) => (
  <>
    {isFocused ? <FocusRing /> : null}
    {purpose === "search" ? <Icon name="search" size="inline" tone="tertiary" /> : null}
  </>
);

/**
The one text field (spec §4.2.28): a visible label over a field `size.hit` high (44 on the web from
`lg`), `radius.md`, `bg.cell` with a 1 px `outline` border, text in `body` (16 on a phone, so a
phone's browser never zooms). Focused, any way, it draws the `focus` ring 2 px + 2 px out; an
error shows a `status.danger` border and the message with its glyph under it, linked to the field
and announced once, after the touched gate lets it through; disabled it is `fill.1` with no
border. `purpose` sets the keyboard and the browser's attributes. In a sheet, Enter in a
single-line field presses the form's action and the field keeps the focus (QA round 21 M1).
*/
export const TextField = ({ onBlur, onFocus, ...props }: TextFieldProps) => {
  const { palette } = useTheme();
  const field = useFieldState({ onBlur, onFocus });
  const submit = useSheetSubmit();
  const {
    editable,
    error: _error,
    hint,
    isInvalid,
    isLabelHidden,
    isMultiline,
    isSubmitted: _isSubmitted,
    label,
    onSubmitEditing,
    purpose,
    ref,
    showErrorWhen: _showErrorWhen,
    ...input
  } = withDefaults(props);
  const shownError = shownErrorOf(withDefaults(props), field.isTouched);
  const isDisabled = !editable;
  const hasMessage = shownError !== null || hint !== undefined;
  return (
    <View className="gap-2">
      {isLabelHidden ? null : (
        <FieldLabel fieldId={field.fieldId} isDisabled={isDisabled} text={label} />
      )}
      <View
        className={boxClass({
          isDisabled,
          isErrored: shownError !== null || isInvalid,
          multiline: isMultiline,
        })}
      >
        <Adornments isFocused={field.isFocused} purpose={purpose} />
        <TextInput
          {...inputPropsOf({
            describedBy: hasMessage ? field.messageId : undefined,
            isMultiline,
            isShown: shownError !== null,
            onSubmitEditing,
            purpose,
            submit,
          })}
          accessibilityLabel={label}
          className={cx(
            "min-w-0 flex-1 py-2 font-sans text-body",
            isDisabled ? "text-label-quaternary" : "text-label-primary",
          )}
          editable={editable}
          id={field.fieldId}
          nativeID={field.fieldId}
          onBlur={field.onBlur}
          onFocus={field.onFocus}
          placeholderTextColor={palette["label.tertiary"]}
          ref={ref}
          {...input}
        />
      </View>
      <FieldMessage error={shownError} hint={hint} id={field.messageId} />
    </View>
  );
};
