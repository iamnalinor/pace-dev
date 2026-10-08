import { Clock } from "lucide-react-native";
import { View } from "react-native";

import { useLanguage, useT } from "#app/app-state.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { formatDuration } from "@pace/core";

/** The estimates offered at one tap; a typed one ("2.5h") stays as it was read. */
const ESTIMATES: readonly number[] = [15, 30, 45, 60, 90, 120, 180, 240];

export const EstimateChip = ({
  isOpen,
  minutes,
  onToggle,
}: {
  readonly minutes: null | number;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}) => {
  const t = useT();
  const language = useLanguage();
  const { palette } = useTheme();
  const text = minutes === null ? t("composer.noEstimate") : formatDuration(minutes, language);
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

/** The estimate picked from a short list, or none; a pick closes the list. */
export const EstimateOptions = ({
  minutes,
  onEstimate,
}: {
  readonly minutes: null | number;
  readonly onEstimate: (minutes: null | number) => void;
}) => {
  const t = useT();
  const language = useLanguage();
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
        {t("composer.noEstimate")}
      </Chip>
    </View>
  );
};
