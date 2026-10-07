import { useState } from "react";

import type { ActionResult, TaskViewModel } from "@pace/client";
import type { Event } from "@pace/core";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { revokeEvents, showUndoToast } from "#web/shared/lib/undo-toast.ts";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { CategoryChips } from "#web/shared/ui/category-chips.tsx";
import { ImportanceChips } from "#web/shared/ui/importance-chips.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#web/shared/ui/sheet.tsx";

import { editChanges, type EditForm, initialEditForm } from "./edit-form.ts";
import { EstimateField, LinkFields, ScheduleFields, TextFields } from "./edit-parts.tsx";

type FormProps = {
  readonly view: TaskViewModel;
  readonly onDone: () => void;
};

type Step = () => ActionResult;
type Run = ReturnType<typeof useRunAction>;

/** Runs the steps one after another (each is validated against what the previous left). */
const runInOrder = async (steps: readonly Step[], run: Run): Promise<null | readonly Event[]> => {
  const [first, ...rest] = steps;
  if (first === undefined) {
    return [];
  }
  const events = await run(first());
  if (events === null) {
    return null;
  }
  const later = await runInOrder(rest, run);
  return later === null ? null : [...events, ...later];
};

/** Writes the sheet in the order the core expects: preset first, then the task, then its scores. */
const useSave = (view: TaskViewModel) => {
  const t = useT();
  const { actions } = useServices();
  const run = useRunAction();
  return async (changes: ReturnType<typeof editChanges>): Promise<boolean> => {
    if (!changes.ok) {
      return false;
    }
    const { estimate, importance, patch, presetId } = changes.value;
    const written = await runInOrder(
      [
        ...(presetId === undefined ? [] : [() => actions.setPreset(view.id, presetId)]),
        ...(Object.keys(patch).length === 0 ? [] : [() => actions.updateTask(view.id, patch)]),
        ...(importance === undefined ? [] : [() => actions.setImportance(view.id, importance)]),
        ...(estimate === undefined ? [] : [() => actions.setEstimate(view.id, estimate)]),
      ],
      run,
    );
    if (written === null) {
      return false;
    }
    if (written.length > 0) {
      showUndoToast({
        message: t("edit.saved"),
        onUndo: () => {
          void revokeEvents(actions.revoke, written);
        },
        undoLabel: t("common.undo"),
      });
    }
    return true;
  };
};

const EditFields = ({ onDone, view }: FormProps) => {
  const t = useT();
  const { hooks } = useServices();
  const { deviceTz } = hooks.useClock();
  const settings = hooks.useSettings();
  const [initial] = useState(() => initialEditForm(view, settings.timezone ?? deviceTz));
  const [form, setForm] = useState<EditForm>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const save = useSave(view);
  const changes = editChanges(view, initial, form);
  const errors = showErrors && !changes.ok ? changes.error : [];
  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setShowErrors(true);
        void (async () => {
          if (await save(changes)) {
            onDone();
          }
        })();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <span aria-hidden="true" className="text-xs text-muted">
          {t("edit.preset")}
        </span>
        <CategoryChips
          onChange={(presetId, defaultImportance) => {
            setForm((current) => ({ ...current, importance: defaultImportance, presetId }));
          }}
          value={form.presetId}
        />
      </div>
      <TextFields errors={errors} form={form} set={set} />
      <ScheduleFields errors={errors} form={form} set={set} />
      <div className="flex flex-col gap-1.5">
        <span aria-hidden="true" className="text-xs text-muted">
          {t("edit.importance")}
        </span>
        <ImportanceChips
          onChange={(value) => {
            set("importance", value);
          }}
          value={form.importance}
        />
      </div>
      <EstimateField form={form} set={set} view={view} />
      <LinkFields form={form} set={set} />
      <SheetFooter>
        <SheetClose asChild>
          <Button className="h-[50px] flex-1 rounded-lg" variant="secondary">
            {t("common.cancel")}
          </Button>
        </SheetClose>
        <Button className="h-[50px] flex-2 rounded-lg font-semibold" type="submit" variant="accent">
          {t("common.save")}
        </Button>
      </SheetFooter>
    </form>
  );
};

type Props = {
  readonly view: TaskViewModel;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
};

/** The override sheet: preset, title, schedule (always with its zone), importance, estimate, fields. */
export const EditSheet = ({ isOpen, onOpenChange, view }: Props) => {
  const t = useT();
  return (
    <Sheet onOpenChange={onOpenChange} open={isOpen}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{t("edit.title")}</SheetTitle>
        </SheetHeader>
        <EditFields
          onDone={() => {
            onOpenChange(false);
          }}
          view={view}
        />
      </SheetContent>
    </Sheet>
  );
};
