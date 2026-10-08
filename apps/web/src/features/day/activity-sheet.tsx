import { type SyntheticEvent, useId, useState } from "react";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { isoToWallClock, wallClockToIso } from "#web/shared/time/wall-clock.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { ChipGroup } from "#web/shared/ui/chip-group.tsx";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "#web/shared/ui/sheet.tsx";
import { ACTIVITY_CATEGORIES, type ActivityCategory, CATEGORY_COLORS } from "@pace/core";

/** What the sheet edits: an existing block (adjust and relabel) or a new past one. */
export type SheetTarget =
  | {
      readonly kind: "edit";
      readonly activityId: string;
      readonly label: string;
      readonly category: ActivityCategory;
      readonly startAt: string;
      /** `null` while it runs: only the start can move. */
      readonly endAt: null | string;
    }
  | { readonly kind: "log"; readonly startAt: string; readonly endAt: string };

type Draft = { readonly label: string; readonly category: ActivityCategory; readonly from: string; readonly to: string };

const TimeField = ({
  label,
  onChange,
  value,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) => {
  const id = useId();
  return (
    <label className="grid gap-1 text-xs text-muted" htmlFor={id}>
      {label}
      <input
        className="h-10 rounded-md border border-line bg-surface px-3 font-mono text-sm text-fg"
        id={id}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        type="datetime-local"
        value={value}
      />
    </label>
  );
};

/** Log a past block, or move and rename one already on the day. */
export const ActivitySheet = ({
  onClose,
  target,
  zone,
}: {
  readonly target: SheetTarget;
  readonly zone: string;
  readonly onClose: () => void;
}) => {
  const t = useT();
  const { actions } = useServices();
  const run = useRunAction();
  const labelId = useId();
  const [error, setError] = useState<null | string>(null);
  const [draft, setDraft] = useState<Draft>(() => ({
    category: target.kind === "edit" ? target.category : "other",
    from: isoToWallClock(target.startAt, zone),
    label: target.kind === "edit" ? target.label : "",
    to: target.endAt === null ? "" : isoToWallClock(target.endAt, zone),
  }));
  const patch = (next: Partial<Draft>): void => {
    setDraft((current) => ({ ...current, ...next }));
  };
  const save = async (): Promise<boolean> => {
    const startAt = wallClockToIso(draft.from, zone);
    const endAt = draft.to === "" ? null : wallClockToIso(draft.to, zone);
    if (startAt === null || (target.kind === "log" && endAt === null) || (endAt !== null && endAt <= startAt)) {
      setError(t("day.badRange"));
      return false;
    }
    if (target.kind === "log") {
      return (
        (await run(
          actions.logPast({ category: draft.category, endAt: endAt ?? startAt, label: draft.label, startAt }),
        )) !== null
      );
    }
    const moved =
      startAt !== target.startAt || (endAt !== null && endAt !== target.endAt)
        ? await run(
            actions.adjustActivity(target.activityId, {
              startAt,
              ...(endAt !== null && target.endAt !== null && { endAt }),
            }),
          )
        : [];
    const renamed =
      draft.label.trim() !== target.label || draft.category !== target.category
        ? await run(actions.relabelActivity(target.activityId, { category: draft.category, label: draft.label }))
        : [];
    return moved !== null && renamed !== null;
  };
  const onSubmit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    if (await save()) {
      onClose();
    }
  };
  return (
    <Sheet
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
      open
    >
      <SheetContent aria-describedby={undefined} closeLabel={t("common.close")}>
        <SheetHeader>
          <SheetTitle>{t(target.kind === "edit" ? "day.editTitle" : "day.logPast")}</SheetTitle>
        </SheetHeader>
        <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
          <label className="grid gap-1 text-xs text-muted" htmlFor={labelId}>
            {t("day.what")}
            <input
              className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-fg"
              id={labelId}
              maxLength={80}
              onChange={(event) => {
                patch({ label: event.target.value });
              }}
              required
              value={draft.label}
            />
          </label>
          <ChipGroup
            label={t("editor.category")}
            onChange={(category) => {
              patch({ category });
            }}
            options={ACTIVITY_CATEGORIES.map((category) => ({
              color: CATEGORY_COLORS[category],
              label: t(`category.${category}`),
              value: category,
            }))}
            value={draft.category}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TimeField
              label={t("day.from")}
              onChange={(from) => {
                patch({ from });
              }}
              value={draft.from}
            />
            {(target.kind === "log" || target.endAt !== null) && (
              <TimeField
                label={t("day.to")}
                onChange={(to) => {
                  patch({ to });
                }}
                value={draft.to}
              />
            )}
          </div>
          {error !== null && (
            <p className="text-xs text-warn" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} type="button" variant="outline">
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="accent">
              {t("common.save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
};
