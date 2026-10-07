import { Link } from "react-router";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { Button } from "#web/shared/ui/button.tsx";
import { BASE_PRESETS, type Preset, presetById } from "@pace/core";

import type { PresetDraft } from "./preset-draft.ts";

import { BackLink, EditorForm } from "./preset-form.tsx";
import { presetLabel } from "./preset-label.ts";

type Props = {
  /** `null` creates a preset; otherwise the one to edit. */
  readonly presetId: null | string;
  /** The parent a new preset starts from. */
  readonly from: null | string;
};

const draftOf = (preset: Preset): PresetDraft => ({
  definition: preset.definition,
  extends: preset.extends ?? "personal",
  id: preset.id,
  name: preset.name,
});

const EditorHeader = ({ title }: { readonly title: string }) => (
  <header className="flex items-center gap-1 px-2 pt-3.5 pb-3">
    <BackLink />
    <h1 className="text-[22px] font-semibold">{title}</h1>
  </header>
);

/** A built-in preset is read-only: it can only be the parent of a new one. */
const BuiltInNotice = ({ preset }: { readonly preset: Preset }) => {
  const t = useT();
  return (
    <>
      <EditorHeader title={presetLabel(preset, t)} />
      <p className="px-5 text-sm text-muted">{t("actionError.preset/built-in")}</p>
      <Button asChild className="mx-4 mt-3 self-start" variant="outline">
        <Link to={`/settings/presets/new?from=${preset.id}`}>
          {t("presets.newFrom", { name: presetLabel(preset, t) })}
        </Link>
      </Button>
    </>
  );
};

const initialDraft = (existing: Preset | undefined, parent: Preset): PresetDraft =>
  existing === undefined
    ? { definition: {}, extends: parent.id, id: "", name: "" }
    : draftOf(existing);

/** The presets editor (web only): a new preset from a parent, or an existing user preset. */
export const PresetEditor = ({ from, presetId }: Props) => {
  const t = useT();
  const presets = useServices().hooks.useAppState((state) => state.presets);
  const existing = presetId === null ? undefined : presetById(presets, presetId);
  if (presetId !== null && existing === undefined) {
    return (
      <>
        <EditorHeader title={t("presets.title")} />
        <p className="px-5 text-sm text-muted">{t("presets.notFound")}</p>
      </>
    );
  }
  if (existing?.builtIn === true) {
    return <BuiltInNotice preset={existing} />;
  }
  const parent = (from === null ? undefined : presetById(presets, from)) ?? BASE_PRESETS.hw;
  return existing === undefined ? (
    <>
      <EditorHeader title={t("presets.new")} />
      <EditorForm
        archived={false}
        initial={initialDraft(undefined, parent)}
        isNew
        key={`new:${parent.id}`}
      />
    </>
  ) : (
    <>
      <EditorHeader title={existing.name} />
      <EditorForm
        archived={existing.archived}
        initial={draftOf(existing)}
        isNew={false}
        key={existing.id}
      />
    </>
  );
};
