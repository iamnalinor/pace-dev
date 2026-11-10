import { useState } from "react";

import { useLanguage, useT } from "#app/app-state.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { RadioGroup } from "#app/ui/radio-group.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { formatDuration, typedActivity } from "@pace/core";

/** The estimates offered at one tap; a typed one ("2.5h") stays as it was read. */
const ESTIMATES: readonly number[] = [15, 30, 45, 60, 90, 120, 180, 240];

/**
"No estimate", or the category's value while this task has no override: in words for the name,
and as the value with a tilde on the chip, whose 180 px cut «По умолчанию (30 мин)» before its
number in Russian (design review H3: a value keeps its number, the words go to the name).
*/
const useNoneText = (
  fallback: null | number,
): { readonly label: string; readonly shown: string } => {
  const t = useT();
  const language = useLanguage();
  if (fallback === null) {
    const none = t("composer.noEstimate");
    return { label: none, shown: none };
  }
  const duration = formatDuration(fallback, language);
  return {
    label: t("form.estimateDefault", { duration }),
    shown: t("form.estimateDefaultShort", { duration }),
  };
};

export const EstimateChip = ({
  fallback = null,
  isOpen,
  minutes,
  onToggle,
}: {
  readonly minutes: null | number;
  readonly fallback?: null | number;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}) => {
  const t = useT();
  const language = useLanguage();
  const none = useNoneText(fallback);
  const value = minutes === null ? null : formatDuration(minutes, language);
  return (
    <Chip
      expanded={isOpen}
      icon="clock"
      isWhole
      label={`${t("composer.estimate")}: ${value ?? none.label}`}
      onPress={onToggle}
    >
      {value ?? none.shown}
    </Chip>
  );
};

/** "50", "2.5 ч", "1h 30m" as minutes; `null` for what does not read as a length. */
const typedMinutes = (text: string): null | number => {
  const typed = text.trim();
  // A bare number is minutes; with a unit ("2,5 ч", "1.5h") it is read like a typed activity.
  const minutes = /^\d+$/u.test(typed) ? Number(typed) : typedActivity(typed).expectMinutes;
  return minutes !== null && minutes > 0 && minutes <= MAX_MINUTES ? Math.round(minutes) : null;
};

/** An Expect or estimate is a day at most. */
const MAX_MINUTES = 24 * 60;

/**
Any other length, typed: Enter sets it. Inside a draft (`onTyped`) each length it reads is handed
over as it is typed, so a Save tapped without Enter finds it (class 219, the typed estimate).
*/
const TypedEstimate = ({
  onEstimate,
  onTyped,
}: {
  readonly onEstimate: (minutes: number) => void;
  readonly onTyped: ((minutes: number) => void) | undefined;
}) => {
  const t = useT();
  const [text, setText] = useState("");
  const minutes = typedMinutes(text);
  return (
    <TextField
      inputMode="text"
      isInvalid={text !== "" && minutes === null}
      label={t("form.estimateTyped")}
      onChangeText={(next) => {
        setText(next);
        const typed = typedMinutes(next);
        if (typed !== null) {
          onTyped?.(typed);
        }
      }}
      onSubmitEditing={() => {
        if (minutes !== null) {
          onEstimate(minutes);
        }
      }}
      placeholder={t("form.estimateTyped")}
      returnKeyType="done"
      value={text}
    />
  );
};

/** The estimate picked from a short list or typed, or none; a pick closes the list. */
export const EstimateOptions = ({
  fallback = null,
  minutes,
  onEstimate,
  onTyped,
}: {
  readonly minutes: null | number;
  readonly fallback?: null | number;
  readonly onEstimate: (minutes: null | number) => void;
  /** A draft hears a typed length as it is typed, without the list closing. */
  readonly onTyped?: (minutes: number) => void;
}) => {
  const t = useT();
  const language = useLanguage();
  const options = ESTIMATES.filter((option) => minutes !== null || option !== fallback);
  return (
    <RadioGroup
      className="flex-row flex-wrap items-center gap-x-2 px-1"
      label={t("composer.estimate")}
      onChange={(option: number) => {
        onEstimate(option);
      }}
      value={minutes}
      values={options}
    >
      {options.map((option) => (
        <Chip key={option} value={option}>
          {formatDuration(option, language)}
        </Chip>
      ))}
      <TypedEstimate onEstimate={onEstimate} onTyped={onTyped} />
    </RadioGroup>
  );
};
