import { useState } from "react";

import type { TaskViewModel } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatMinutes } from "#web/shared/format/duration.ts";
import { formatDayTime } from "#web/shared/format/time.ts";
import { cn } from "#web/shared/lib/cn.ts";
import { ZonedTime } from "#web/shared/time/zoned-time.tsx";

import { whyLines, whyTitle } from "./why-lines.ts";

const Stat = ({
  children,
  label,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) => (
  <div className="min-w-0">
    <dt className="text-[11px] text-muted">{label}</dt>
    <dd className="mt-1 font-mono text-sm">{children}</dd>
  </div>
);

/** How far through its window the task is: "Issued Mon 10:00 · 82% of window gone". */
const WindowBar = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  const language = useLanguage();
  const { deviceTz, now } = useServices().hooks.useClock();
  const { startAt, startTz, windowElapsed } = view.stats;
  if (windowElapsed === null) {
    return null;
  }
  const width = `${String(Math.round(Math.min(Math.max(windowElapsed, 0), 1) * 100))}%`;
  return (
    <div>
      <p className="flex justify-between gap-2 text-[11px] text-muted">
        <span>
          {startAt !== null &&
            t("task.issued", { when: formatDayTime(startAt, now, startTz ?? deviceTz, language) })}
        </span>
        <span>{t("task.windowGone", { percent: Math.round(windowElapsed * 100) })}</span>
      </p>
      <div aria-hidden="true" className="mt-1.5 h-1 rounded-full bg-track">
        <div className="h-1 rounded-full bg-fg" style={{ width }} />
      </div>
    </div>
  );
};

type WhyProps = {
  readonly view: TaskViewModel;
  readonly title: string;
};

/** The explanation card: what went into the score, in words and units. */
const WhyCard = ({ title, view }: WhyProps) => {
  const t = useT();
  const language = useLanguage();
  const { deviceTz } = useServices().hooks.useClock();
  const settings = useServices().hooks.useSettings();
  const lines = whyLines(view.why.rows, {
    importance: view.overrideSheet.importance,
    language,
    rank: view.rank,
    tz: settings.timezone ?? deviceTz,
  });
  return (
    <section
      aria-labelledby="why-title"
      className="mx-4 mt-3 rounded-xl border border-line p-3.5"
      id="why"
    >
      <h2 className="mb-1.5 text-[13px] font-medium" id="why-title">
        {title}
      </h2>
      <dl>
        {lines.map((line) => (
          <div
            className="flex items-baseline justify-between gap-3 border-t border-line py-[7px] text-[13px]"
            key={line.key}
          >
            <dt className="text-muted">{line.label}</dt>
            <dd className={cn("font-mono", line.tone === "warn" && "text-warn")}>{line.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 border-t border-line pt-2 font-mono text-[11px] wrap-break-word text-faint">
        <span className="sr-only">{t("task.whyFormula")}: </span>
        {view.why.formula}
      </p>
    </section>
  );
};

/** Due (in its own zone), work left, tracked, the window bar and the "why" explanation. */
export const TaskStats = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  const language = useLanguage();
  const { hooks } = useServices();
  const { deviceTz } = hooks.useClock();
  const { rows } = hooks.useNow();
  const [isWhyOpen, setWhyOpen] = useState(false);
  const { dueAt, dueTz, trackedMinutes, workLeftMinutes } = view.stats;
  const title = whyTitle(
    rows.findIndex((row) => row.id === view.id),
    language,
  );
  return (
    <>
      <section className="mx-4 mt-4 flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5">
        <dl className="grid grid-cols-3 gap-2">
          <Stat label={t("task.due")}>
            {dueAt === null || dueTz === null ? (
              t("task.noDue")
            ) : (
              <ZonedTime at={dueAt} deviceTz={deviceTz} mode="due" tz={dueTz} />
            )}
          </Stat>
          <Stat label={t("task.workLeft")}>
            {formatMinutes(workLeftMinutes, language, { approx: true })}
          </Stat>
          <Stat label={t("task.tracked")}>{formatMinutes(trackedMinutes, language)}</Stat>
        </dl>
        <WindowBar view={view} />
        {view.closed === null && (
          <button
            aria-controls="why"
            aria-expanded={isWhyOpen}
            className="-my-2 min-h-11 self-start rounded-sm text-left text-xs text-fg2 outline-none hover:text-fg focus-visible:ring-[3px] focus-visible:ring-accent/40"
            onClick={() => {
              setWhyOpen((current) => !current);
            }}
            type="button"
          >
            {title} →
          </button>
        )}
      </section>
      {isWhyOpen && <WhyCard title={title} view={view} />}
    </>
  );
};
