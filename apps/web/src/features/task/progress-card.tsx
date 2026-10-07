import { useState } from "react";

import type { TaskViewModel } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatNumber } from "#web/shared/format/number.ts";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { Slider } from "#web/shared/ui/slider.tsx";
import { formatRelativeDay } from "@pace/core";

const SLIDER_MAX = 10;

/** The work variant's 0–10 progress slider with the pace marker: where it should be by now. */
export const ProgressCard = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  const language = useLanguage();
  const { actions, hooks } = useServices();
  const { deviceTz, now } = hooks.useClock();
  const run = useRunAction();
  // While the knob moves the draft shows; the committed value comes back from the store.
  const [draft, setDraft] = useState<null | number>(null);
  const value = draft ?? view.progress.slider ?? 0;
  const pace = view.stats.windowElapsed;
  const day = (at: string, tz: null | string): string =>
    formatRelativeDay(at, now, { language, tz: tz ?? deviceTz });
  return (
    <section className="mx-4 mt-4 rounded-xl border border-line bg-surface p-3.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13px] font-medium">{t("task.progress")}</h2>
        <span className="font-mono text-[13px]">{t("task.progressOf", { value })}</span>
      </div>
      <Slider
        className="mt-3.5"
        disabled={view.closed !== null}
        marker={pace}
        max={SLIDER_MAX}
        min={0}
        onValueChange={([next]) => {
          setDraft(next ?? null);
        }}
        onValueCommit={([next]) => {
          void (async () => {
            if (next !== undefined && next !== view.progress.slider) {
              await run(actions.setProgress(view.id, next));
            }
            setDraft(null);
          })();
        }}
        step={1}
        thumbLabel={t("task.progressAria")}
        value={[value]}
      />
      <p className="mt-1 flex justify-between gap-2 text-[11px] text-muted">
        <span>
          {view.stats.startAt !== null &&
            t("task.started", { when: day(view.stats.startAt, view.stats.startTz) })}
        </span>
        {pace !== null && (
          <span className="text-accentText">
            {t("task.paceSays", { value: formatNumber(pace * SLIDER_MAX, language) })}
          </span>
        )}
        <span>{view.stats.dueAt !== null && day(view.stats.dueAt, view.stats.dueTz)}</span>
      </p>
    </section>
  );
};
