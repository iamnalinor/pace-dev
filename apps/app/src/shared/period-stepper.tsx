import { useRef } from "react";
import { View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { Button } from "#app/ui/button.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { Pressable } from "#app/ui/pressable.tsx";
import { Text } from "#app/ui/text.tsx";

export type PeriodStepperProps = {
  /** The period in words ("Sunday, Nov 1"); a polite live region, said once as it changes. */
  readonly label: string;
  /** Makes the label a button that opens a picker, handed the label's node to anchor to. */
  readonly onLabel?: ((anchor: React.RefObject<null | View>) => void) | undefined;
  /** What the label's button says it does ("Pick a day"); with `onLabel`. */
  readonly labelAction?: string | undefined;
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly onPrevious: () => void;
  /** `null` at the present: the next period is in the future, so › is not offered. */
  readonly onNext: (() => void) | null;
  /** The reset's words ("Today", "This week"). */
  readonly todayLabel: string;
  /** Away from the current period: only then is the reset there. */
  readonly isAway: boolean;
  readonly onToday: () => void;
};

/** The period's name, a button when it opens a picker. */
const PeriodLabel = ({
  label,
  labelAction,
  onLabel,
}: Pick<PeriodStepperProps, "label" | "labelAction" | "onLabel">) => {
  const anchorRef = useRef<View>(null);
  const text = (
    <Text accessibilityLiveRegion="polite" numeric role="headline">
      {label}
    </Text>
  );
  if (onLabel === undefined) {
    return text;
  }
  return (
    <Pressable
      className="min-w-0 shrink justify-center rounded-md px-2"
      label={labelAction === undefined ? label : `${label}. ${labelAction}`}
      onPress={() => {
        onLabel(anchorRef);
      }}
      ref={anchorRef}
      role="button"
    >
      {text}
    </Pressable>
  );
};

/**
The one period control of Day, Week, History and Insights (spec §4.3.4, §5.0.2; F-CMP-05): a pill
track holding ‹, the period's name and ›, then the reset («Сегодня») which is there only away from
the current period. › is not offered at the present (hidden, not greyed) and the reset's slot is
kept either way, so nothing on the row moves when they come and go. The pill sets the period's
chevrons apart from the header's back chevron. A group named "Period".
*/
export const PeriodStepper = ({
  isAway,
  label,
  labelAction,
  nextLabel,
  onLabel,
  onNext,
  onPrevious,
  onToday,
  previousLabel,
  todayLabel,
}: PeriodStepperProps) => {
  const t = useT();
  return (
    <View
      aria-label={t("period.group")}
      className="min-w-0 flex-row items-center gap-2"
      role="group"
    >
      <View className="min-w-0 shrink flex-row items-center rounded-pill bg-fill-2">
        <IconButton icon="chevron-left" label={previousLabel} onPress={onPrevious} />
        <PeriodLabel label={label} labelAction={labelAction} onLabel={onLabel} />
        <View
          accessibilityElementsHidden={onNext === null}
          importantForAccessibility={onNext === null ? "no-hide-descendants" : "auto"}
          pointerEvents={onNext === null ? "none" : "auto"}
          style={onNext === null ? HIDDEN : undefined}
        >
          <IconButton
            disabled={onNext === null}
            icon="chevron-right"
            label={nextLabel}
            onPress={onNext ?? NOTHING}
          />
        </View>
      </View>
      <View
        accessibilityElementsHidden={!isAway}
        className="shrink-0"
        importantForAccessibility={isAway ? "auto" : "no-hide-descendants"}
        pointerEvents={isAway ? "auto" : "none"}
        style={isAway ? undefined : HIDDEN}
      >
        <Button disabled={!isAway} onPress={onToday} variant="plain">
          {todayLabel}
        </Button>
      </View>
    </View>
  );
};

const HIDDEN = { opacity: 0 } as const;

const NOTHING = (): void => {
  // Not offered: the control is hidden and takes no press.
};
