import { useT } from "#app/app-state.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";

/** ‹ and › between weeks; › is off on the current week (the future has nothing to show). */
export const WeekArrows = ({
  next,
  onWeek,
  previous,
}: {
  readonly previous: string;
  readonly next: null | string;
  readonly onWeek: (weekOf: null | string) => void;
}) => {
  const t = useT();
  return (
    <>
      <IconButton
        icon={"chevron-left"}
        label={t("insights.previous")}
        onPress={() => {
          onWeek(previous);
        }}
        variant="plain"
      />
      <IconButton
        disabled={next === null}
        icon={"chevron-right"}
        label={t("insights.next")}
        onPress={() => {
          onWeek(next);
        }}
        variant="plain"
      />
    </>
  );
};
