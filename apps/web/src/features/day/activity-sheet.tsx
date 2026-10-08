import { type SyntheticEvent, useId, useState } from "react";

import {
  type ActivityForm,
  activityFormOf,
  type ActivitySheetProps,
  type ActivityTarget,
  hasEnd,
} from "@pace/client";
import { useDraft } from "@pace/client/react";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { isoToWallClock, wallClockToIso } from "#web/shared/time/wall-clock.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { ChipGroup } from "#web/shared/ui/chip-group.tsx";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "#web/shared/ui/sheet.tsx";
import { ACTIVITY_CATEGORIES, CATEGORY_COLORS } from "@pace/core";

/** What the sheet edits: an existing block (move and rename) or a new past one. */
export type SheetTarget = ActivityTarget;

type Draft = ActivityForm;

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

type Range = { readonly startAt: string; readonly endAt: null | string };

/** The typed boundaries as instants; `null` when one is missing or the end is not after the start. */
const rangeOf = (draft: Draft, target: SheetTarget, zone: string): null | Range => {
  const startAt = wallClockToIso(draft.from, zone);
  const endAt = draft.to === "" ? null : wallClockToIso(draft.to, zone);
  if (startAt === null || (endAt !== null && endAt <= startAt)) {
    return null;
  }
  return endAt === null && target.kind === "log" ? null : { endAt, startAt };
};

/** What it was, its category and its boundaries (the end only once it has one). */
const ActivityFields = ({
  draft,
  isEndEditable,
  patch,
}: {
  readonly draft: Draft;
  readonly isEndEditable: boolean;
  readonly patch: (next: Partial<Draft>) => void;
}) => {
  const t = useT();
  const labelId = useId();
  return (
    <>
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
        {isEndEditable && (
          <TimeField
            label={t("day.to")}
            onChange={(to) => {
              patch({ to });
            }}
            value={draft.to}
          />
        )}
      </div>
    </>
  );
};

/** Log a past block, or move and rename one already on the day. */
export const ActivitySheet = ({ onClose, target, zone }: ActivitySheetProps) => {
  const t = useT();
  const [error, setError] = useState<null | string>(null);
  const { actions } = useServices();
  const run = useRunAction();
  const [draft, patch] = useDraft(() =>
    activityFormOf(target, (atIso) => isoToWallClock(atIso, zone)),
  );
  const onSubmit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    const range = rangeOf(draft, target, zone);
    if (range === null) {
      setError(t("day.badRange"));
      return;
    }
    const entry = { category: draft.category, label: draft.label, ...range };
    if ((await run(actions.saveActivity(target, entry))) !== null) {
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
          <ActivityFields draft={draft} isEndEditable={hasEnd(target)} patch={patch} />
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
