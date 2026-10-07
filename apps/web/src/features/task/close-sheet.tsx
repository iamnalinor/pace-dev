import { CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";

import type { QuickTimeKey, TaskViewModel } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatList } from "#web/shared/format/number.ts";
import { formatDateTime, formatTime } from "#web/shared/format/time.ts";
import { cn } from "#web/shared/lib/cn.ts";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { isoToWallClock, wallClockToIso } from "#web/shared/time/wall-clock.ts";
import { Button } from "#web/shared/ui/button.tsx";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#web/shared/ui/sheet.tsx";
import { Switch } from "#web/shared/ui/switch.tsx";

import { closePreview, problemName, recentReasons } from "./close-preview.ts";

/** `submit` sends solved problems; `done` closes a whole task; `close` closes one with nothing to send. */
export type CloseMode = "close" | "done" | "submit";

type When =
  | { readonly kind: "exact"; readonly local: string }
  | { readonly kind: "quick"; readonly key: QuickTimeKey };

const pillClass = (isOn: boolean): string =>
  cn(
    "flex h-9 items-center rounded-pill border px-3 text-[13px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40 disabled:opacity-40",
    isOn
      ? "border-inverse bg-inverse font-medium text-inverseFg"
      : "border-line text-fg2 hover:bg-raised",
  );

const PreviewRow = ({
  children,
  label,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) => (
  <div className="flex justify-between gap-3">
    <dt className="text-muted">{label}</dt>
    <dd className="text-right">{children}</dd>
  </div>
);

type FormProps = {
  readonly view: TaskViewModel;
  readonly mode: CloseMode;
  readonly onDone: () => void;
};

const useTitles = (view: TaskViewModel, mode: CloseMode, sending: readonly string[]) => {
  const t = useT();
  const language = useLanguage();
  const names = view.problems.filter((problem) => sending.includes(problem.id)).map(problemName);
  switch (mode) {
    case "submit": {
      return {
        title: t("close.submitTitle", { problems: formatList(names, language) }),
        subtitle: t("close.subtitleSolved", { title: view.title }),
        when: t("close.whenSubmitted"),
      };
    }
    case "done": {
      return { subtitle: view.title, title: t("close.doneTitle"), when: t("close.whenDone") };
    }
    case "close": {
      return { subtitle: view.title, title: t("close.closeTitle"), when: t("close.whenClosed") };
    }
  }
};

/** The sheet's body; it mounts on open, so every opening starts from "now". */
const CloseForm = ({ mode, onDone, view }: FormProps) => {
  const t = useT();
  const language = useLanguage();
  const { actions, hooks } = useServices();
  const { deviceTz, now } = hooks.useClock();
  const settings = hooks.useSettings();
  const { byId } = hooks.useAppState((state) => state.tasks);
  const reasons = useMemo(() => recentReasons(byId), [byId]);
  const run = useRunAction();
  const zone = settings.timezone ?? deviceTz;
  const [when, setWhen] = useState<When>({ key: "now", kind: "quick" });
  const [isExact, setExact] = useState(true);
  const [isOtherOpen, setOtherOpen] = useState(false);
  const [reason, setReason] = useState("");
  const sending = view.primaryAction.kind === "submit" ? view.primaryAction.subtaskIds : [];
  const titles = useTitles(view, mode, sending);
  const at =
    when.kind === "quick"
      ? (view.quickTimes.find((quick) => quick.key === when.key)?.at ?? now)
      : wallClockToIso(when.local, zone);
  const preview =
    at === null
      ? null
      : closePreview({ at, dueAt: view.stats.dueAt, problems: view.problems, sending });
  const precision = isExact ? "exact" : "approx";
  const outcomeText = (outcome: "before-deadline" | "done" | "late"): string => {
    switch (outcome) {
      case "before-deadline": {
        return t("close.beforeDeadline");
      }
      case "late": {
        return t("close.late");
      }
      case "done": {
        return t("outcome.done");
      }
    }
  };
  const happened = (instant: string): string =>
    isoToWallClock(instant, deviceTz).slice(0, 10) === isoToWallClock(now, deviceTz).slice(0, 10)
      ? formatTime(instant, deviceTz, language)
      : formatDateTime(instant, deviceTz, language);

  const finish = async (): Promise<void> => {
    if (at === null) {
      return;
    }
    const events =
      mode === "submit"
        ? await run(actions.submit({ at, precision, subtaskIds: sending, taskId: view.id }), {
            undo: t("close.submittedToast", { count: sending.length, title: view.title }),
          })
        : await run(actions.closeTask({ at, outcome: "done", precision, taskId: view.id }), {
            undo: t("close.closedToast", { outcome: t("outcome.done"), title: view.title }),
          });
    if (events !== null) {
      onDone();
    }
  };
  const closeAs = async (outcome: "cancelled" | "skipped"): Promise<void> => {
    if (at === null) {
      return;
    }
    const events = await run(
      actions.closeTask({
        at,
        outcome,
        precision,
        reason: reason.trim() === "" ? undefined : reason,
        taskId: view.id,
      }),
      { undo: t("close.closedToast", { outcome: t(`outcome.${outcome}`), title: view.title }) },
    );
    if (events !== null) {
      onDone();
    }
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{titles.title}</SheetTitle>
        <SheetDescription>{titles.subtitle}</SheetDescription>
      </SheetHeader>
      <fieldset>
        <legend className="mb-2 text-xs text-muted">{titles.when}</legend>
        <div className="flex flex-wrap gap-1.5">
          {view.quickTimes.map((quick) => (
            <button
              aria-pressed={when.kind === "quick" && when.key === quick.key}
              className={pillClass(when.kind === "quick" && when.key === quick.key)}
              disabled={Date.parse(quick.at) > Date.parse(now)}
              key={quick.key}
              onClick={() => {
                setWhen({ key: quick.key, kind: "quick" });
              }}
              type="button"
            >
              {t(`quickTime.${quick.key}`)}
            </button>
          ))}
          <button
            aria-label={t("close.pickExact")}
            aria-pressed={when.kind === "exact"}
            className={pillClass(when.kind === "exact")}
            onClick={() => {
              setWhen({ kind: "exact", local: isoToWallClock(at ?? now, zone) });
            }}
            type="button"
          >
            <CalendarDays aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        {when.kind === "exact" && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <input
              aria-label={t("close.pickExact")}
              className="h-11 rounded-md border border-line bg-bg px-3 font-mono text-sm text-fg"
              onChange={(event) => {
                setWhen({ kind: "exact", local: event.target.value });
              }}
              type="datetime-local"
              value={when.local}
            />
            <span>{t("edit.inZone", { zone })}</span>
          </div>
        )}
        {at === null && (
          <p className="mt-1.5 text-xs text-warn" role="alert">
            {t("close.timeInvalid")}
          </p>
        )}
      </fieldset>

      <div className="flex items-center justify-between gap-3">
        <div>
          <label className="text-sm" htmlFor="close-exact">
            {t("close.exact")}
          </label>
          <p className="text-xs text-muted" id="close-exact-hint">
            {t("close.exactHint")}
          </p>
        </div>
        <Switch
          aria-describedby="close-exact-hint"
          checked={isExact}
          id="close-exact"
          onCheckedChange={setExact}
        />
      </div>

      {preview !== null && at !== null && (
        <dl className="flex flex-col gap-1.5 rounded-lg bg-bg p-3 text-[13px]">
          <PreviewRow label={t("close.outcome")}>{outcomeText(preview.outcome)}</PreviewRow>
          {mode === "submit" && preview.stillOpen.length > 0 && (
            <PreviewRow label={t("close.stillOpen")}>{preview.stillOpen.join(", ")}</PreviewRow>
          )}
          <PreviewRow label={t("close.recorded")}>
            <span className="font-mono text-xs">
              {t("close.recordedAt", {
                happened: happened(at),
                recorded: formatTime(now, deviceTz, language),
              })}
            </span>
          </PreviewRow>
        </dl>
      )}

      <SheetFooter>
        <SheetClose asChild>
          <Button className="h-[50px] flex-1 rounded-lg text-[15px]" variant="secondary">
            {t("common.cancel")}
          </Button>
        </SheetClose>
        <Button
          className="h-[50px] flex-2 rounded-lg text-[15px] font-semibold"
          disabled={at === null}
          onClick={() => {
            void finish();
          }}
          variant="accent"
        >
          {t(mode === "submit" ? "close.submit" : "close.done")}
        </Button>
      </SheetFooter>

      <div className="-mt-2 flex flex-col gap-3">
        <Button
          aria-controls="close-other"
          aria-expanded={isOtherOpen}
          className="text-[13px] text-muted"
          onClick={() => {
            setOtherOpen((current) => !current);
          }}
          variant="ghost"
        >
          {t("close.other")}
        </Button>
        {isOtherOpen && (
          <div className="flex flex-col gap-3" id="close-other">
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              {t("close.reason")}
              <input
                className="h-11 rounded-md border border-line bg-bg px-3 text-sm text-fg placeholder:text-faint"
                onChange={(event) => {
                  setReason(event.target.value);
                }}
                placeholder={t("close.reasonPlaceholder")}
                value={reason}
              />
            </label>
            {reasons.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted">{t("close.recentReasons")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {reasons.map((recent) => (
                    <button
                      className={pillClass(reason === recent)}
                      key={recent}
                      onClick={() => {
                        setReason(recent);
                      }}
                      type="button"
                    >
                      {recent}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={at === null}
                onClick={() => {
                  void closeAs("cancelled");
                }}
                variant="outline"
              >
                {t("close.cancelled")}
              </Button>
              <Button
                className="flex-1"
                disabled={at === null}
                onClick={() => {
                  void closeAs("skipped");
                }}
                variant="outline"
              >
                {t("close.skipped")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

type Props = {
  readonly view: TaskViewModel;
  readonly mode: CloseMode;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
};

/** Artboard 4: when it happened, how exactly, what it means, and the other ways to close. */
export const CloseSheet = ({ isOpen, mode, onOpenChange, view }: Props) => (
  <Sheet onOpenChange={onOpenChange} open={isOpen}>
    <SheetContent>
      <CloseForm
        mode={mode}
        onDone={() => {
          onOpenChange(false);
        }}
        view={view}
      />
    </SheetContent>
  </Sheet>
);
