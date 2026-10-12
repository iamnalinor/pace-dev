import { Clock } from "lucide-react-native";
import { useState } from "react";
import { TextInput, View } from "react-native";

import { useLanguage, useT } from "#app/app-state.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { cx } from "#app/ui/cx.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { formatDuration, typedActivity } from "@pace/core";

/** The estimates offered at one tap; a typed one ("2.5h") stays as it was read. */
const ESTIMATES: readonly number[] = [15, 30, 45, 60, 90, 120, 180, 240];

/** "No estimate", or the category's: "1h by category". */
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
  const { palette } = useTheme();
  const none = useNoneText(fallback);
  const text = minutes === null ? none : formatDuration(minutes, language);
  return (
    <Chip
      label={`${t("composer.estimate")}: ${text}`}
      leading={<Clock color={palette.fg2} size={14} strokeWidth={1.75} />}
      onPress={onToggle}
      selected={isOpen}
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
  const { palette } = useTheme();
  const [text, setText] = useState("");
  const minutes = typedMinutes(text);
  return (
    <TextInput
      accessibilityLabel={t("form.estimateTyped")}
      className={cx(
        "h-8 min-w-[120px] rounded-pill border px-3 font-sans text-[13px] text-fg",
        text !== "" && minutes === null ? "border-warn" : "border-line",
      )}
      onChangeText={setText}
      onSubmitEditing={() => {
        if (minutes !== null) {
          onEstimate(minutes);
        }
      }}
      placeholder={t("form.estimateTyped")}
      placeholderTextColor={palette.muted}
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
  const none = useNoneText(fallback);
  return (
    <View
      aria-label={t("composer.estimate")}
      className="flex-row flex-wrap gap-1.5 px-1"
      role="radiogroup"
    >
      {ESTIMATES.map((option) => (
        <Chip
          key={option}
          onPress={() => {
            onEstimate(option);
          }}
          selected={option === minutes}
        >
          {formatDuration(option, language)}
        </Chip>
      ))}
      <Chip
        onPress={() => {
          onEstimate(null);
        }}
        selected={minutes === null}
      >
        {none}
      </Chip>
      <TypedEstimate onEstimate={onEstimate} />
    </View>
  );
};
