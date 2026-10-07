import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { actionErrorText } from "#web/shared/lib/action-error.ts";
import { cn } from "#web/shared/lib/cn.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { ProjectDot } from "#web/shared/ui/project-dot.tsx";
import { EXAMPLE_PRESET_IDS, type Preset, presetById, resolvePreset } from "@pace/core";

import { CONTROL_CLASS } from "./control-class.ts";
import { presetLabel } from "./preset-label.ts";

const byKindThenName = (a: Preset, b: Preset): number =>
  a.builtIn === b.builtIn ? a.name.localeCompare(b.name) : Number(b.builtIn) - Number(a.builtIn);

const Badge = ({
  children,
  tone = "plain",
}: {
  readonly children: string;
  readonly tone?: "plain" | "quiet";
}) => (
  <span
    className={cn(
      "rounded-sm px-1.5 py-0.5 text-[11px]",
      tone === "plain" ? "bg-raised text-fg2" : "text-muted",
    )}
  >
    {children}
  </span>
);

const PresetRow = ({ preset }: { readonly preset: Preset }) => {
  const t = useT();
  const presets = useServices().hooks.useAppState((state) => state.presets);
  const resolved = resolvePreset(presets, preset.id);
  const body = (
    <>
      <ProjectDot color={resolved.ok ? resolved.value.color : null} />
      <span className="min-w-0 flex-1 truncate text-[15px]">{presetLabel(preset, t)}</span>
      {preset.archived && <Badge tone="quiet">{t("presets.archivedBadge")}</Badge>}
      <Badge>{t(preset.builtIn ? "presets.builtIn" : "presets.yours")}</Badge>
    </>
  );
  const rowClass = "flex min-h-14 items-center gap-3 border-b border-line px-1";
  return (
    <li>
      {preset.builtIn ? (
        <div className={rowClass}>{body}</div>
      ) : (
        <Link
          className={cn(
            rowClass,
            "outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40",
          )}
          to={`/settings/presets/${preset.id}`}
        >
          {body}
          <ChevronRight aria-hidden="true" className="size-4 text-faint" strokeWidth={1.75} />
        </Link>
      )}
    </li>
  );
};

const NewPreset = ({ choices }: { readonly choices: readonly Preset[] }) => {
  const t = useT();
  const id = useId();
  const navigate = useNavigate();
  const [from, setFrom] = useState("hw");
  return (
    <div className="grid gap-2 rounded-xl border border-line bg-surface p-3.5">
      <label className="text-xs text-muted" htmlFor={id}>
        {t("presets.startFrom")}
      </label>
      <div className="flex gap-2">
        <select
          className={CONTROL_CLASS}
          id={id}
          onChange={(event) => {
            setFrom(event.target.value);
          }}
          value={from}
        >
          {choices.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {presetLabel(preset, t)}
            </option>
          ))}
        </select>
        <Button
          onClick={() => void navigate(`/settings/presets/new?from=${encodeURIComponent(from)}`)}
        >
          {t("presets.new")}
        </Button>
      </div>
    </div>
  );
};

/** Settings → Presets: built-in and own presets, new from any of them, the example seed. */
export const PresetsList = () => {
  const t = useT();
  const { actions, hooks } = useServices();
  const presets = hooks.useAppState((state) => state.presets);
  const [isShowingArchived, setIsShowingArchived] = useState(false);
  const all = Object.values(presets.byId)
    .filter((preset) => preset.id !== "inbox")
    .toSorted(byKindThenName);
  const shown = all.filter((preset) => isShowingArchived || !preset.archived);
  const hasExamples = EXAMPLE_PRESET_IDS.some((id) => presetById(presets, id) !== undefined);

  const seed = async (): Promise<void> => {
    const result = await actions.seedExamplePresets();
    if (!result.ok) {
      toast.error(actionErrorText(t, result.error));
    }
  };

  return (
    <div className="grid gap-4 px-4 pb-6">
      <NewPreset choices={all.filter((preset) => !preset.archived)} />
      {!hasExamples && (
        <Button className="justify-self-start" onClick={() => void seed()} variant="outline">
          {t("presets.seedExamples")}
        </Button>
      )}
      <label className="flex min-h-11 items-center gap-3 text-sm text-fg2">
        <input
          checked={isShowingArchived}
          className="size-4 accent-accent"
          onChange={(event) => {
            setIsShowingArchived(event.target.checked);
          }}
          type="checkbox"
        />
        {t("presets.showArchived")}
      </label>
      <ul aria-label={t("presets.title")}>
        {shown.map((preset) => (
          <PresetRow key={preset.id} preset={preset} />
        ))}
      </ul>
    </div>
  );
};
