import { type SyntheticEvent, useId, useState } from "react";

import type { TimeButtonView } from "@pace/client";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { ChipGroup } from "#web/shared/ui/chip-group.tsx";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "#web/shared/ui/sheet.tsx";
import { ACTIVITY_CATEGORIES, type ActivityCategory, CATEGORY_COLORS, CATEGORY_DEFAULTS } from "@pace/core";

export type EditorTarget =
  | { readonly kind: "edit"; readonly button: TimeButtonView }
  | { readonly kind: "new" };

type Draft = {
  readonly label: string;
  readonly category: ActivityCategory;
  readonly expect: string;
  readonly limit: string;
  readonly taskId: string;
};

const minutesOf = (text: string): null | number => {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const draftOf = (target: EditorTarget): Draft =>
  target.kind === "edit"
    ? {
        category: target.button.category,
        expect: target.button.expectMinutes === null ? "" : String(target.button.expectMinutes),
        label: target.button.label,
        limit: target.button.limitMinutes === null ? "" : String(target.button.limitMinutes),
        taskId: target.button.taskId ?? "",
      }
    : { category: "other", expect: "", label: "", limit: "", taskId: "" };

const NumberField = ({
  hint,
  label,
  onChange,
  value,
}: {
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) => {
  const id = useId();
  return (
    <label className="grid gap-1 text-xs text-muted" htmlFor={id}>
      {label}
      <input
        aria-describedby={`${id}-hint`}
        className="h-10 rounded-md border border-line bg-surface px-3 font-mono text-sm text-fg"
        id={id}
        inputMode="numeric"
        min={1}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        type="number"
        value={value}
      />
      <span id={`${id}-hint`}>{hint}</span>
    </label>
  );
};

/** The sheet behind "press and hold": a button's name, category, Expect, Limit and task. */
export const ButtonEditor = ({ onClose, target }: { readonly target: EditorTarget; readonly onClose: () => void }) => {
  const t = useT();
  const { actions, hooks } = useServices();
  const run = useRunAction();
  const tasks = hooks.useNow().rows;
  const [draft, setDraft] = useState(() => draftOf(target));
  const labelId = useId();
  const patch = (next: Partial<Draft>): void => {
    setDraft((current) => ({ ...current, ...next }));
  };
  const onSubmit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    const saved = await run(
      actions.saveButton(target.kind === "edit" ? target.button.id : null, {
        category: draft.category,
        expectMinutes: minutesOf(draft.expect),
        label: draft.label,
        limitMinutes: minutesOf(draft.limit),
        taskId: draft.taskId === "" ? null : draft.taskId,
      }),
    );
    if (saved !== null) {
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
      <SheetContent closeLabel={t("common.close")}>
        <SheetHeader>
          <SheetTitle>{t(target.kind === "edit" ? "editor.title" : "editor.newTitle")}</SheetTitle>
          <SheetDescription>{t("time.buttonHint")}</SheetDescription>
        </SheetHeader>
        <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
          <label className="grid gap-1 text-xs text-muted" htmlFor={labelId}>
            {t("editor.label")}
            <input
              className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-fg"
              id={labelId}
              maxLength={80}
              onChange={(event) => {
                patch({ label: event.target.value });
              }}
              value={draft.label}
            />
          </label>
          <ChipGroup
            label={t("editor.category")}
            onChange={(category) => {
              const defaults = CATEGORY_DEFAULTS[category];
              patch({
                category,
                expect: defaults.expectMinutes === null ? draft.expect : String(defaults.expectMinutes),
                limit: defaults.limitMinutes === null ? draft.limit : String(defaults.limitMinutes),
              });
            }}
            options={ACTIVITY_CATEGORIES.map((category) => ({
              color: CATEGORY_COLORS[category],
              label: t(`category.${category}`),
              value: category,
            }))}
            value={draft.category}
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              hint={t("editor.expectHint")}
              label={t("editor.expect")}
              onChange={(expect) => {
                patch({ expect });
              }}
              value={draft.expect}
            />
            <NumberField
              hint={t("editor.limitHint")}
              label={t("editor.limit")}
              onChange={(limit) => {
                patch({ limit });
              }}
              value={draft.limit}
            />
          </div>
          <label className="grid gap-1 text-xs text-muted">
            {t("editor.task")}
            <select
              className="h-10 rounded-md border border-line bg-surface px-2 text-sm text-fg"
              onChange={(event) => {
                patch({ taskId: event.target.value });
              }}
              value={draft.taskId}
            >
              <option value="">{t("editor.noTask")}</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap justify-between gap-2">
            {target.kind === "edit" ? (
              <Button
                onClick={() => {
                  void (async () => {
                    if ((await run(actions.removeButton(target.button.id))) !== null) {
                      onClose();
                    }
                  })();
                }}
                type="button"
                variant="ghost"
              >
                {t("editor.remove")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button onClick={onClose} type="button" variant="outline">
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="accent">
                {t("common.save")}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
};
