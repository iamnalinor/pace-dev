import { useT } from "#app/app-state.tsx";

import { PeriodStepper } from "./period-stepper.tsx";

/** ‹ the week's range › and «This week» away from it: Week's and Insights' period slot. */
export const WeekPeriod = ({
  isAway,
  label,
  next,
  onWeek,
  previous,
}: {
  readonly label: string;
  readonly isAway: boolean;
  readonly previous: string;
  /** `null` on the current week: › is not offered. */
  readonly next: null | string;
  readonly onWeek: (weekOf: null | string) => void;
}) => {
  const t = useT();
  return (
    <PeriodStepper
      isAway={isAway}
      label={label}
      nextLabel={t("insights.next")}
      onNext={
        next === null
          ? null
          : () => {
              onWeek(next);
            }
      }
      onPrevious={() => {
        onWeek(previous);
      }}
      onToday={() => {
        onWeek(null);
      }}
      previousLabel={t("insights.previous")}
      todayLabel={t("period.thisWeek")}
    />
  );
};
