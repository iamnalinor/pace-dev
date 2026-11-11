import type { NowRow } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { AcceptedHighlight } from "#app/shared/assistant/accepted-highlight.tsx";
import { CheckCircle } from "#app/ui/check-circle.tsx";
import { cx } from "#app/ui/cx.ts";
import { Dissolve } from "#app/ui/dissolve.tsx";
import { ListRow } from "#app/ui/list-row.tsx";

import { MetaLine, RepeatMark } from "./meta-line.tsx";
import { useSelectedTask } from "./task-opener.tsx";

/** Muted and struck through once closed, quiet for an undated Nice-to-have, else medium. */
const titleLook = (isChecked: boolean, isDimmed: boolean) =>
  isChecked || isDimmed
    ? { className: cx(isChecked && "line-through"), tone: "secondary" as const }
    : { className: "font-medium" };

const NOTHING = (): void => undefined;

/**
A task as every list shows it (Now, a project's open and done lists, History): a `ListRow` with
the check beside it, the title (two lines at most), the meta line and a repeat mark trailing.
*/
export const TaskRow = ({
  asOf,
  checked = false,
  isDissolving = false,
  onCheck,
  onDissolved,
  onOpen,
  row,
  withTag = true,
}: {
  /** History's moment: relative words count from it. */
  readonly asOf?: string;
  /** A closed task: the check is filled and the title muted. */
  readonly checked?: boolean;
  /** Without it the check is read-only. */
  readonly onCheck?: () => void;
  /** Just checked: the row fades and closes up, then `onDissolved` lets it go. */
  readonly isDissolving?: boolean;
  readonly onDissolved?: () => void;
  readonly onOpen: () => void;
  readonly row: NowRow;
  /** The project page leaves the project's own tag out. */
  readonly withTag?: boolean;
}) => {
  const t = useT();
  const isSelected = useSelectedTask() === row.id;
  return (
    <AcceptedHighlight id={row.id}>
      <Dissolve isActive={isDissolving} onDone={onDissolved ?? NOTHING}>
        <ListRow
          control={
            <CheckCircle
              checked={checked || isDissolving}
              label={t("now.markDone", { title: row.title })}
              {...(onCheck !== undefined && { onPress: onCheck })}
            />
          }
          meta={
            <MetaLine asOf={asOf} parts={row.meta} showRepeat={false} tag={withTag ? row : null} />
          }
          onPress={onOpen}
          role="link"
          selected={isSelected}
          title={row.title}
          titleLines={2}
          titleLook={titleLook(checked, row.dimmed)}
          trailing={row.meta.some((part) => part.kind === "repeats") ? <RepeatMark /> : undefined}
        />
      </Dissolve>
    </AcceptedHighlight>
  );
};
