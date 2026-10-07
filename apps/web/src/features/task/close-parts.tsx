import { CalendarDays } from "lucide-react";
import { useState } from "react";

import type { TaskViewModel } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatDateTime, formatTime } from "#web/shared/format/time.ts";
import { cn } from "#web/shared/lib/cn.ts";
import { isoToWallClock } from "#web/shared/time/wall-clock.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { Switch } from "#web/shared/ui/switch.tsx";

import type { closePreview } from "./close-preview.ts";
import type { When } from "./use-close-form.ts";

export const pillClass = (isOn: boolean): string =>
  cn(
    "flex h-9 items-center rounded-pill border px-3 text-[13px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40 disabled:opacity-40",
    isOn
      ? "border-inverse bg-inverse font-medium text-inverseFg"
      : "border-line text-fg2 hover:bg-raised",
  );

type WhenProps = {
  readonly view: TaskViewModel;
  readonly when: When;
  readonly at: null | string;
  readonly legend: string;
  readonly onWhen: (when: When) => void;
};

/** The quick times as pills, or an exact time typed in the account zone. */
export const WhenPicker = ({ at, legend, onWhen, view, when }: WhenProps) => {
  const t = useT();
  const { hooks } = useServices();
  const { deviceTz, now } = hooks.useClock();
  const zone = hooks.useSettings().timezone ?? deviceTz;
  return (
    <fieldset>
      <legend className="mb-2 text-xs text-muted">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {view.quickTimes.map((quick) => {
          const isOn = when.kind === "quick" && when.key === quick.key;
          return (
            <button
              aria-pressed={isOn}
              className={pillClass(isOn)}
              disabled={Date.parse(quick.at) > Date.parse(now)}
              key={quick.key}
              onClick={() => {
                onWhen({ key: quick.key, kind: "quick" });
              }}
              type="button"
            >
              {t(`quickTime.${quick.key}`)}
            </button>
          );
        })}
        <button
          aria-label={t("close.pickExact")}
          aria-pressed={when.kind === "exact"}
          className={pillClass(when.kind === "exact")}
          onClick={() => {
            onWhen({ kind: "exact", local: isoToWallClock(at ?? now, zone) });
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
              onWhen({ kind: "exact", local: event.target.value });
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
  );
};

export const ExactSwitch = ({
  isExact,
  onChange,
}: {
  readonly isExact: boolean;
  readonly onChange: (isExact: boolean) => void;
}) => {
  const t = useT();
  return (
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
        onCheckedChange={onChange}
      />
    </div>
  );
};

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

const OUTCOME_KEY = {
  "before-deadline": "close.beforeDeadline",
  done: "outcome.done",
  late: "close.late",
} as const;

/** What gets recorded: the outcome, the problems still open, and both instants. */
export const ClosePreviewList = ({
  at,
  isSubmit,
  preview,
}: {
  readonly at: string;
  readonly isSubmit: boolean;
  readonly preview: ReturnType<typeof closePreview>;
}) => {
  const t = useT();
  const language = useLanguage();
  const { deviceTz, now } = useServices().hooks.useClock();
  const isToday =
    isoToWallClock(at, deviceTz).slice(0, 10) === isoToWallClock(now, deviceTz).slice(0, 10);
  const happened = isToday
    ? formatTime(at, deviceTz, language)
    : formatDateTime(at, deviceTz, language);
  return (
    <dl className="flex flex-col gap-1.5 rounded-lg bg-bg p-3 text-[13px]">
      <PreviewRow label={t("close.outcome")}>{t(OUTCOME_KEY[preview.outcome])}</PreviewRow>
      {isSubmit && preview.stillOpen.length > 0 && (
        <PreviewRow label={t("close.stillOpen")}>{preview.stillOpen.join(", ")}</PreviewRow>
      )}
      <PreviewRow label={t("close.recorded")}>
        <span className="font-mono text-xs">
          {t("close.recordedAt", { happened, recorded: formatTime(now, deviceTz, language) })}
        </span>
      </PreviewRow>
    </dl>
  );
};

type OtherProps = {
  readonly reason: string;
  readonly reasons: readonly string[];
  readonly isDisabled: boolean;
  readonly onReason: (reason: string) => void;
  readonly onCloseAs: (outcome: "cancelled" | "skipped") => void;
};

/** "Close task as…": a reason (typed or a recent one) and Cancelled · Skipped. */
export const CloseOther = ({ isDisabled, onCloseAs, onReason, reason, reasons }: OtherProps) => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="-mt-2 flex flex-col gap-3">
      <Button
        aria-controls="close-other"
        aria-expanded={isOpen}
        className="text-[13px] text-muted"
        onClick={() => {
          setIsOpen((current) => !current);
        }}
        variant="ghost"
      >
        {t("close.other")}
      </Button>
      {isOpen && (
        <div className="flex flex-col gap-3" id="close-other">
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            {t("close.reason")}
            <input
              className="h-11 rounded-md border border-line bg-bg px-3 text-sm text-fg placeholder:text-muted"
              onChange={(event) => {
                onReason(event.target.value);
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
                      onReason(recent);
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
            {(["cancelled", "skipped"] as const).map((outcome) => (
              <Button
                className="flex-1"
                disabled={isDisabled}
                key={outcome}
                onClick={() => {
                  onCloseAs(outcome);
                }}
                variant="outline"
              >
                {t(`close.${outcome}`)}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
