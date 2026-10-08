import { Plus, Square } from "lucide-react";
import { useState } from "react";

import type { RunningView, TimeButtonView } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatMinutes } from "#web/shared/format/duration.ts";
import { cn } from "#web/shared/lib/cn.ts";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { ColorTag, colorChipClass, fillClass } from "#web/shared/ui/color-tag.tsx";

import { ButtonEditor, type EditorTarget } from "./button-editor.tsx";
import { useLongPress } from "./use-long-press.ts";

const STATUS_TEXT = {
  "near-limit": "time.nearLimit",
  "over-expect": "time.overExpect",
  "over-limit": "time.overLimit",
} as const;

/** What is running: its tag, the time so far against its Expect/Limit, and Stop. */
const RunningRow = ({ onStop, running }: { readonly running: RunningView; readonly onStop: () => void }) => {
  const t = useT();
  const language = useLanguage();
  const target = running.expectMinutes ?? running.limitMinutes;
  const isOver = running.status === "over-limit" || running.status === "over-expect";
  const statusKey = running.status in STATUS_TEXT ? STATUS_TEXT[running.status as keyof typeof STATUS_TEXT] : null;
  return (
    <div aria-live="polite" className="flex items-center gap-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-2 text-sm">
          <ColorTag color={running.color}>{running.label}</ColorTag>
          <span className="font-mono text-[13px] text-fg">{formatMinutes(running.minutes, language)}</span>
          {target !== null && (
            <span className="text-xs text-muted">
              {running.expectMinutes === null
                ? t("time.limitOf", { duration: formatMinutes(target, language) })
                : t("time.expectOf", { duration: formatMinutes(target, language) })}
            </span>
          )}
          {statusKey !== null && (
            <span className={cn("text-xs font-medium", isOver ? "text-warn" : "text-question")}>
              {t(statusKey)}
            </span>
          )}
        </p>
        {running.share !== null && (
          <div className="h-1 overflow-hidden rounded-full bg-track">
            <div
              className={cn("h-full rounded-full", isOver ? "bg-warn" : fillClass(running.color))}
              style={{ width: `${String(Math.round(running.share * 100))}%` }}
            />
          </div>
        )}
      </div>
      <Button aria-label={t("time.stop")} onClick={onStop} size="sm" variant="outline">
        <Square aria-hidden="true" className="size-3.5" />
        {t("time.stop")}
      </Button>
    </div>
  );
};

const ActivityButton = ({
  button,
  onEdit,
  onTap,
}: {
  readonly button: TimeButtonView;
  readonly onTap: () => void;
  readonly onEdit: () => void;
}) => {
  const t = useT();
  const handlers = useLongPress(onTap, onEdit);
  return (
    <button
      aria-description={t("time.buttonHint")}
      aria-pressed={button.isRunning}
      className={cn(
        "flex h-10 min-w-0 touch-manipulation items-center justify-center rounded-md border px-2 text-[13px] select-none outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-accent/40",
        colorChipClass(button.color, button.isRunning),
      )}
      type="button"
      {...handlers}
    >
      <span className="truncate">{button.label}</span>
    </button>
  );
};

/**
The time bar at the bottom of Now: one tap on an activity starts it and ends the running one
(a tap on the running one stops it); press and hold to change a button's defaults.
*/
export const TimeBar = () => {
  const t = useT();
  const { actions, hooks } = useServices();
  const run = useRunAction();
  const bar = hooks.useTimeBar();
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const tap = (button: TimeButtonView): void => {
    const previous = bar.running?.label;
    const message = button.isRunning
      ? t("time.stopped", { label: button.label })
      : previous === undefined
        ? t("time.started", { label: button.label })
        : t("time.switched", { from: previous, to: button.label });
    void run(actions.tapButton(button.id), { undo: message });
  };
  return (
    <section aria-label={t("time.bar")} className="border-t border-line bg-bg px-3 pt-2.5 pb-2.5">
      <div className="flex min-h-9 items-center gap-2">
        <div className="min-w-0 flex-1">
          {bar.running === null ? (
            <p className="text-xs text-muted">{t("time.idle")}</p>
          ) : (
            <RunningRow
              onStop={() => {
                void run(actions.stopActivity(), {
                  undo: t("time.stopped", { label: bar.running?.label ?? "" }),
                });
              }}
              running={bar.running}
            />
          )}
        </div>
        <Button
          aria-label={t("time.addButton")}
          onClick={() => {
            setEditing({ kind: "new" });
          }}
          size="icon-sm"
          variant="ghost"
        >
          <Plus aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <div aria-label={t("time.bar")} className="mt-2 grid grid-cols-4 gap-1.5 lg:grid-cols-8" role="group">
        {bar.buttons.map((button) => (
          <ActivityButton
            button={button}
            key={button.id}
            onEdit={() => {
              setEditing({ button, kind: "edit" });
            }}
            onTap={() => {
              tap(button);
            }}
          />
        ))}
      </div>
      {editing !== null && (
        <ButtonEditor
          onClose={() => {
            setEditing(null);
          }}
          target={editing}
        />
      )}
    </section>
  );
};
