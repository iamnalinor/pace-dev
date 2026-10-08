import { useState } from "react";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatMinutes } from "#web/shared/format/duration.ts";
import { formatDateTime, formatDayTime } from "#web/shared/format/time.ts";
import { cn } from "#web/shared/lib/cn.ts";
import { ZonedTime } from "#web/shared/time/zoned-time.tsx";
import { percent } from "#web/shared/ui/pace-bar.tsx";
import { type TaskViewModel, whyText } from "@pace/client";

import { whyTitle } from "./why-lines.ts";

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
  const width = percent(windowElapsed);
  return (
    <div>
      <p className="flex justify-between gap-2 text-[11px] text-muted">
        <span>
          {startAt !== null &&
            t("task.issued", {
              when: formatDayTime({ at: startAt, tz: startTz ?? deviceTz }, { language, now }),
            })}
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

/** The explanation card: what went into the score in four short blocks, then the formula filled in. */
const WhyCard = ({ title, view }: WhyProps) => {
  const t = useT();
  const language = useLanguage();
  const { deviceTz } = useServices().hooks.useClock();
  const settings = useServices().hooks.useSettings();
  const tz = settings.timezone ?? deviceTz;
  const text = whyText(view.why, {
    importance: view.overrideSheet.importance,
    instant: (iso) => formatDateTime(iso, tz, language),
    language,
    rank: view.rank,
  });
  return (
    <section
      aria-labelledby="why-title"
      className="mx-4 mt-3 rounded-xl border border-line p-3.5"
      id="why"
    >
      <h2 className="mb-1 text-[13px] font-medium" id="why-title">
        {title}
      </h2>
      <div className="grid gap-x-6 sm:grid-cols-2">
        {text.groups.map((group) => (
          <dl className={cn("pt-2", group.name === "result" && "sm:col-span-2")} key={group.name}>
            <p className="pb-0.5 font-mono text-[11px] tracking-[0.06em] text-faint uppercase">
              {group.title}
            </p>
            {group.lines.map((line) => (
              <div
                className={cn(
                  "flex items-baseline justify-between gap-3 py-[5px] text-[13px]",
                  // The score is the total the board sorts by: a heavy rule and bold set it apart.
                  line.tone === "total"
                    ? "mt-1 border-t-2 border-fg font-semibold"
                    : "border-t border-line",
                )}
                key={line.id}
              >
                <dt className={line.tone === "total" ? "text-fg" : "text-muted"}>{line.label}</dt>
                <dd className={cn("font-mono", line.tone === "warn" && "text-warn")}>
                  {line.value}
                </dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
      <p className="mt-3 border-t border-line pt-2 text-[12px] wrap-break-word text-muted">
        <span className="sr-only">{t("task.whyFormula")}: </span>
        {text.formula.map((run) => (
          <span
            className={cn("font-mono", run.isValue && "font-medium text-accentText")}
            key={run.id}
          >
            {run.text}
          </span>
        ))}
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
  const [isWhyOpen, setIsWhyOpen] = useState(false);
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
              setIsWhyOpen((current) => !current);
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
