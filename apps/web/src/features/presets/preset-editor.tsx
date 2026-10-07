import { ChevronLeft } from "lucide-react";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { actionErrorText } from "#web/shared/lib/action-error.ts";
import { cn } from "#web/shared/lib/cn.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { BASE_PRESETS, type Preset, presetById, resolvePreset } from "@pace/core";

import { CONTROL_CLASS } from "./control-class.ts";
import { definitionIssues, type PresetDraft, slugify } from "./preset-draft.ts";
import { presetLabel } from "./preset-label.ts";
import { PresetPreview } from "./preset-preview.tsx";
import { PresetSections } from "./preset-sections.tsx";

type Props = {
  /** `null` creates a preset; otherwise the one to edit. */
  readonly presetId: null | string;
  /** The parent a new preset starts from. */
  readonly from: null | string;
};

const NO_ISSUES: ReadonlySet<string> = new Set();

const BackLink = () => {
  const t = useT();
  return (
    <Button aria-label={t("common.back")} asChild size="icon" variant="ghost">
      <Link to="/settings/presets">
        <ChevronLeft aria-hidden="true" strokeWidth={1.75} />
      </Link>
    </Button>
  );
};

const Identity = ({
  draft,
  isNew,
  onDraft,
}: {
  readonly draft: PresetDraft;
  readonly isNew: boolean;
  readonly onDraft: (draft: PresetDraft) => void;
}) => {
  const t = useT();
  const id = useId();
  const [isIdTouched, setIsIdTouched] = useState(false);
  const presets = useServices().hooks.useAppState((state) => state.presets);
  const parents = Object.values(presets.byId).filter(
    (preset) =>
      preset.id !== draft.id &&
      preset.id !== "inbox" &&
      (!preset.archived || preset.id === draft.extends),
  );
  return (
    <section className="mx-4 grid gap-2 rounded-xl border border-line bg-surface p-3.5">
      <label className="text-xs text-muted" htmlFor={`${id}-name`}>
        {t("presets.name")}
      </label>
      <input
        className={CONTROL_CLASS}
        id={`${id}-name`}
        onChange={(event) => {
          const name = event.target.value;
          onDraft({ ...draft, name, ...(isNew && !isIdTouched && { id: slugify(name) }) });
        }}
        value={draft.name}
      />
      <label className="text-xs text-muted" htmlFor={`${id}-id`}>
        {t("presets.id")}
      </label>
      <input
        className={cn(CONTROL_CLASS, "font-mono")}
        disabled={!isNew}
        id={`${id}-id`}
        onChange={(event) => {
          setIsIdTouched(true);
          onDraft({ ...draft, id: event.target.value });
        }}
        value={draft.id}
      />
      <label className="text-xs text-muted" htmlFor={`${id}-extends`}>
        {t("presets.extends")}
      </label>
      <select
        className={CONTROL_CLASS}
        id={`${id}-extends`}
        onChange={(event) => {
          onDraft({ ...draft, extends: event.target.value });
        }}
        value={draft.extends}
      >
        {parents.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {presetLabel(preset, t)}
          </option>
        ))}
      </select>
    </section>
  );
};

const EditorForm = ({
  archived,
  initial,
  isNew,
}: {
  readonly initial: PresetDraft;
  readonly isNew: boolean;
  readonly archived: boolean;
}) => {
  const t = useT();
  const navigate = useNavigate();
  const { actions, hooks } = useServices();
  const presets = hooks.useAppState((state) => state.presets);
  const [draft, setDraft] = useState(initial);
  const [problem, setProblem] = useState<null | string>(null);
  const [issues, setIssues] = useState(NO_ISSUES);
  const parent = presetById(presets, draft.extends);
  const resolved = resolvePreset(presets, draft.extends);
  const inherited = resolved.ok ? resolved.value : BASE_PRESETS.personal.definition;

  const save = async (): Promise<void> => {
    if (draft.name.trim() === "") {
      setProblem(t("presets.nameRequired"));
      return;
    }
    const input = {
      definition: draft.definition,
      extends: draft.extends,
      id: draft.id.trim(),
      name: draft.name.trim(),
    };
    const result = isNew ? await actions.createPreset(input) : await actions.updatePreset(input);
    setIssues(
      !result.ok && result.error === "preset/invalid-definition"
        ? definitionIssues(draft.definition)
        : NO_ISSUES,
    );
    setProblem(result.ok ? null : actionErrorText(t, result.error));
    if (!result.ok) {
      return;
    }

    toast(t("presets.saved"));
    await navigate("/settings/presets");
  };

  const archive = async (): Promise<void> => {
    const result = await actions.archivePreset(draft.id);
    setProblem(result.ok ? null : actionErrorText(t, result.error));
    if (!result.ok) {
      return;
    }

    toast(t("presets.archived"));
    await navigate("/settings/presets");
  };

  return (
    <div className="flex flex-col pb-6">
      <Identity draft={draft} isNew={isNew} onDraft={setDraft} />
      <PresetPreview draft={draft} />
      <PresetSections
        definition={draft.definition}
        inherited={inherited}
        issues={issues}
        onChange={(definition) => {
          setDraft({ ...draft, definition });
        }}
        parentName={parent === undefined ? draft.extends : presetLabel(parent, t)}
      />
      {problem !== null && (
        <p className="mx-5 mt-3 text-sm text-warn" role="alert">
          {problem}
        </p>
      )}
      <div className="flex gap-2 px-4 pt-4">
        {!isNew && !archived && (
          <Button onClick={() => void archive()} variant="ghost">
            {t("presets.archive")}
          </Button>
        )}
        <Button className="flex-1" onClick={() => void save()} variant="accent">
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
};

const draftOf = (preset: Preset): PresetDraft => ({
  definition: preset.definition,
  extends: preset.extends ?? "personal",
  id: preset.id,
  name: preset.name,
});

/** The presets editor (web only): a new preset from a parent, or an existing user preset. */
export const PresetEditor = ({ from, presetId }: Props) => {
  const t = useT();
  const presets = useServices().hooks.useAppState((state) => state.presets);
  const existing = presetId === null ? undefined : presetById(presets, presetId);
  const header = (title: string) => (
    <header className="flex items-center gap-1 px-2 pt-3.5 pb-3">
      <BackLink />
      <h1 className="text-[22px] font-semibold">{title}</h1>
    </header>
  );
  if (presetId !== null && existing === undefined) {
    return (
      <>
        {header(t("presets.title"))}
        <p className="px-5 text-sm text-muted">{t("presets.notFound")}</p>
      </>
    );
  }
  if (existing?.builtIn === true) {
    return (
      <>
        {header(presetLabel(existing, t))}
        <p className="px-5 text-sm text-muted">{t("actionError.preset/built-in")}</p>
        <Button asChild className="mx-4 mt-3 self-start" variant="outline">
          <Link to={`/settings/presets/new?from=${existing.id}`}>
            {t("presets.newFrom", { name: presetLabel(existing, t) })}
          </Link>
        </Button>
      </>
    );
  }
  const parent = presetById(presets, from ?? "") ?? BASE_PRESETS.hw;
  const initial =
    existing === undefined
      ? { definition: {}, extends: parent.id, id: "", name: "" }
      : draftOf(existing);
  return (
    <>
      {header(existing === undefined ? t("presets.new") : existing.name)}
      <EditorForm
        archived={existing?.archived ?? false}
        initial={initial}
        isNew={existing === undefined}
        key={presetId ?? `new:${parent.id}`}
      />
    </>
  );
};
