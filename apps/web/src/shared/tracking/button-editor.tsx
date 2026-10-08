import { type SyntheticEvent, useId } from "react";

import {
  type ButtonForm,
  buttonFormOf,
  buttonSaveOf,
  type EditorProps,
  withCategory,
} from "@pace/client";
import { useDraft } from "@pace/client/react";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { ChipGroup } from "#web/shared/ui/chip-group.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#web/shared/ui/sheet.tsx";
import { ACTIVITY_CATEGORIES, CATEGORY_COLORS } from "@pace/core";

export type { EditorTarget } from "@pace/client";

type Draft = ButtonForm;

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

/** Category, Expect, Limit and the linked task: what an activity started from the button gets. */
const DefaultsFields = ({
  draft,
  patch,
}: {
  readonly draft: Draft;
  readonly patch: (next: Partial<Draft>) => void;
}) => {
  const t = useT();
  const tasks = useServices().hooks.useNow().rows;
  return (
    <>
      <ChipGroup
        label={t("editor.category")}
        onChange={(category) => {
          patch(withCategory(draft, category));
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
    </>
  );
};

/** Remove (for an existing button), Cancel and Save. */
const EditorActions = ({ onClose, target }: EditorProps) => {
  const t = useT();
  const { actions } = useServices();
  const run = useRunAction();
  return (
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
  );
};

/** The sheet behind "press and hold": a button's name, category, Expect, Limit and task. */
export const ButtonEditor = ({ onClose, target }: EditorProps) => {
  const t = useT();
  const { actions } = useServices();
  const run = useRunAction();
  const [draft, patch] = useDraft(() => buttonFormOf(target));
  const labelId = useId();
  const onSubmit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    const { buttonId, draft: button } = buttonSaveOf(target, draft);
    if ((await run(actions.saveButton(buttonId, button))) !== null) {
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
          <DefaultsFields draft={draft} patch={patch} />
          <EditorActions onClose={onClose} target={target} />
        </form>
      </SheetContent>
    </Sheet>
  );
};
