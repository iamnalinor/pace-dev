import { useState } from "react";

import { useLanguage, useT } from "#app/app-state.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { RadioGroup } from "#app/ui/radio-group.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { formatDuration, typedActivity } from "@pace/core";

/** The estimates offered at one tap; a typed one ("2.5h") stays as it was read. */
const ESTIMATES: readonly number[] = [15, 30, 45, 60, 90, 120, 180, 240];

/** "No estimate", or the category's value while this task has no override. */
const useNoneText = (fallback: null | number): string => {
  const t = useT();
  const language = useLanguage();
  return fallback === null
    ? t("composer.noEstimate")
    : t("form.estimateDefault", { duration: formatDuration(fallback, language) });
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
  const text = minutes === null ? none : formatDuration(minutes, language);
  return (
    <Chip
      expanded={isOpen}
      icon="clock"
      label={`${t("composer.estimate")}: ${text}`}
      onPress={onToggle}
    >
      {text}
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

/** Any other length, typed: Enter sets it. */
const TypedEstimate = ({ onEstimate }: { readonly onEstimate: (minutes: number) => void }) => {
  const t = useT();
  const [text, setText] = useState("");
  const minutes = typedMinutes(text);
  return (
    <TextField
      inputMode="text"
      isInvalid={text !== "" && minutes === null}
      label={t("form.estimateTyped")}
      onChangeText={setText}
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
}: {
  readonly minutes: null | number;
  readonly fallback?: null | number;
  readonly onEstimate: (minutes: null | number) => void;
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
      <TypedEstimate onEstimate={onEstimate} />
    </RadioGroup>
  );
};
