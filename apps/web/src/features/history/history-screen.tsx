import { useState } from "react";

import type { HistoryEntry } from "@pace/client";
import type { MessageKey } from "@pace/core";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatDateTime } from "#web/shared/format/time.ts";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { TaskRow } from "#web/shared/task/task-row.tsx";
import { isoToWallClock, wallClockToIso } from "#web/shared/time/wall-clock.ts";
import { Button } from "#web/shared/ui/button.tsx";
import { PageHeader } from "#web/shared/ui/page-header.tsx";

const DAY_MS = 86_400_000;

const shiftDays = (atIso: string, days: number): string =>
  new Date(Date.parse(atIso) + days * DAY_MS).toISOString();

const EventRow = ({ entry, tz }: { readonly entry: HistoryEntry; readonly tz: string }) => {
  const t = useT();
  const language = useLanguage();
  const run = useRunAction();
  const { actions } = useServices();
  const label = t(`event.${entry.type}` as MessageKey);
  return (
    <li className="flex items-start justify-between gap-3 border-t border-line py-2.5 text-sm">
      <div className="min-w-0">
        <p className={entry.revokedBy === null ? "" : "text-muted line-through"}>
          {label}
          {entry.taskTitle !== null && <span className="text-fg2"> · {entry.taskTitle}</span>}
        </p>
        <p className="font-mono text-xs text-muted">
          {formatDateTime(entry.occurredAt, tz, language)} · {t(`source.${entry.source}`)} ·{" "}
          {t("history.recordedAt", { at: formatDateTime(entry.recordedAt, tz, language) })}
        </p>
      </div>
      {entry.revocable ? (
        <Button
          aria-label={t("history.revoke", { event: label })}
          onClick={() => {
            void run(actions.revoke(entry.id));
          }}
          size="sm"
          variant="outline"
        >
          {t("common.undo")}
        </Button>
      ) : (
        entry.revokedBy !== null && <span className="text-xs text-muted">{t("history.revoked")}</span>
      )}
    </li>
  );
};

/** The board as it was at any instant, and every recorded change with an undo. */
export const HistoryScreen = () => {
  const t = useT();
  const { hooks } = useServices();
  const { deviceTz, now } = hooks.useClock();
  const [atIso, setAtIso] = useState<null | string>(null);
  const at = atIso ?? now;
  const history = hooks.useHistory(at);
  return (
    <main className="flex flex-1 flex-col gap-4 pb-6">
      <PageHeader title={t("history.title")} />
      <section className="grid gap-2 px-5">
        <label className="grid gap-1 text-xs text-muted">
          {t("history.at")}
          <input
            className="h-11 rounded-md border border-line bg-surface px-3 font-mono text-sm text-fg"
            onChange={(event) => {
              const iso = wallClockToIso(event.target.value, deviceTz);
              if (iso !== null) {
                setAtIso(iso);
              }
            }}
            type="datetime-local"
            value={isoToWallClock(at, deviceTz)}
          />
        </label>
        <div className="flex gap-2">
          <Button onClick={() => { setAtIso(shiftDays(at, -1)); }} size="sm" variant="outline">
            {t("history.dayBack")}
          </Button>
          <Button onClick={() => { setAtIso(shiftDays(at, 1)); }} size="sm" variant="outline">
            {t("history.dayForward")}
          </Button>
          <Button onClick={() => { setAtIso(null); }} size="sm" variant="ghost">
            {t("history.now")}
          </Button>
        </div>
      </section>
      <section aria-label={t("history.board")} className="px-3">
        <h2 className="px-2 pb-1 text-sm font-medium text-muted">{t("history.boardAt")}</h2>
        {history.board.rows.length === 0 ? (
          <p className="px-2 text-sm text-muted">{t("history.boardEmpty")}</p>
        ) : (
          <ul className="flex flex-col">
            {history.board.rows.map((row) => (
              <TaskRow key={row.id} now={at} row={row} />
            ))}
          </ul>
        )}
      </section>
      <section aria-label={t("history.events")} className="px-5">
        <h2 className="pb-1 text-sm font-medium text-muted">{t("history.events")}</h2>
        {history.events.length === 0 ? (
          <p className="text-sm text-muted">{t("history.empty")}</p>
        ) : (
          <ul>
            {history.events.map((entry) => (
              <EventRow entry={entry} key={entry.id} tz={deviceTz} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
};
