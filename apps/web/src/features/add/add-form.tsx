import { X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import type { MessageKey } from "@pace/core";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { actionErrorText } from "#web/shared/lib/action-error.ts";
import { Button } from "#web/shared/ui/button.tsx";

import { type AddDraft, draftToForm, EMPTY_DRAFT } from "./add-draft.ts";
import { PlanFields, WorkFields } from "./add-fields.tsx";
import { GoesTo } from "./goes-to.tsx";
import { openInstances } from "./instances.ts";

/** The manual Add form (the form half of artboard 5): text, fields card, To Inbox / Add. */
export const AddForm = () => {
  const t = useT();
  const id = useId();
  const navigate = useNavigate();
  const { actions, hooks, state } = useServices();
  const settings = hooks.useSettings();
  const ctx = hooks.useClock();
  // Re-render on every store change: the instance list below is read from the store.
  hooks.useAppState((current) => current.version);
  const [draft, setDraft] = useState<AddDraft>(EMPTY_DRAFT);
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const accountZone = settings.timezone ?? ctx.deviceTz;
  const zone = draft.dueTz ?? accountZone;
  const instancesOf = (presetId: string) =>
    openInstances(state.store.getState(), presetId, { now: ctx.now, zone: accountZone });
  const instance = instancesOf(draft.presetId).find((choice) => choice.id === draft.instanceId);
  const patch = (next: Partial<AddDraft>): void => {
    setDraft((current) => ({ ...current, ...next }));
  };

  const fail = (code: Parameters<typeof actionErrorText>[1]): void => {
    toast.error(actionErrorText(t, code));
  };

  const addToInstance = async (instanceId: string): Promise<void> => {
    setProblem(draft.problems.length === 0 ? "add.problemsRequired" : null);
    if (draft.problems.length === 0) {
      return;
    }
    const result = await actions.addSubtasks(instanceId, draft.problems);
    if (result.ok) {
      toast(t("add.added"));
      await navigate(`/task/${instanceId}`);
    } else {
      fail(result.error);
    }
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (instance !== undefined) {
      await addToInstance(instance.id);
      return;
    }
    const form = draftToForm(draft, zone);
    setProblem(form.ok ? null : form.error);
    if (form.ok) {
      const result = await actions.createTask(form.value);
      const created = result.ok ? result.value.at(-1) : undefined;
      if (!result.ok) {
        fail(result.error);
      } else if (created?.type === "task.created") {
        toast(t("add.added"));
        await navigate(`/task/${created.payload.taskId}`);
      }
    }
  };

  const toInbox = async (): Promise<void> => {
    const result = await actions.captureInbox(draft.text);
    setProblem(result.ok ? null : "add.titleRequired");
    if (!result.ok) {
      return;
    }

    toast(t("add.toInboxDone"));
    await navigate("/inbox");
  };

  return (
    <form
      className="flex flex-1 flex-col"
      noValidate
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <header className="flex items-center justify-between pt-3.5 pr-2 pb-1 pl-5">
        <h1 className="text-[22px] font-semibold">{t("nav.add")}</h1>
        <Button aria-label={t("common.close")} asChild size="icon" variant="ghost">
          <Link to="/">
            <X aria-hidden="true" strokeWidth={1.75} />
          </Link>
        </Button>
      </header>
      <label className="sr-only" htmlFor={id}>
        {t("add.text")}
      </label>
      <textarea
        className="mx-4 min-h-24 resize-none rounded-xl border border-line bg-surface p-3 text-sm/normal text-fg outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-accent/40"
        id={id}
        onChange={(event) => {
          patch({ text: event.target.value });
        }}
        placeholder={t("add.textPlaceholder")}
        rows={4}
        value={draft.text}
      />
      <section className="mx-4 mt-3.5 rounded-xl border border-line bg-surface px-3.5 pt-1.5 pb-1">
        <GoesTo
          instanceId={draft.instanceId}
          instances={instancesOf(draft.presetId)}
          onInstance={(instanceId) => {
            patch({ instanceId });
          }}
          onPreset={(presetId) => {
            patch({ instanceId: instancesOf(presetId)[0]?.id ?? null, presetId });
          }}
          presetId={draft.presetId}
        />
        {instance === undefined && <PlanFields draft={draft} onPatch={patch} zone={zone} />}
        <WorkFields draft={draft} onPatch={patch} />
      </section>
      {problem !== null && (
        <p className="mx-5 mt-3 text-sm text-warn" role="alert">
          {t(problem)}
        </p>
      )}
      <div className="min-h-4 flex-1" />
      <div className="flex gap-2 px-4 pt-1 pb-6">
        <Button
          className="h-[50px] flex-1 rounded-xl"
          onClick={() => {
            void toInbox();
          }}
          variant="secondary"
        >
          {t("add.toInbox")}
        </Button>
        <Button
          className="h-[50px] flex-2 rounded-xl text-[15px] font-semibold"
          type="submit"
          variant="accent"
        >
          {instance === undefined ? t("add.submit") : t("add.addTo", { title: instance.title })}
        </Button>
      </div>
    </form>
  );
};
