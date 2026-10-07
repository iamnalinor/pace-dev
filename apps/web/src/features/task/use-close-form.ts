import { useMemo, useState } from "react";

import type { QuickTimeKey, TaskViewModel } from "@pace/client";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { wallClockToIso } from "#web/shared/time/wall-clock.ts";

import { closePreview, recentReasons } from "./close-preview.ts";

/** `submit` sends solved problems; `done` closes a whole task; `close` closes one with nothing to send. */
export type CloseMode = "close" | "done" | "submit";

export type When =
  | { readonly kind: "exact"; readonly local: string }
  | { readonly kind: "quick"; readonly key: QuickTimeKey };

type Options = {
  readonly view: TaskViewModel;
  readonly mode: CloseMode;
  readonly onDone: () => void;
};

const useInstant = (view: TaskViewModel, when: When): null | string => {
  const { hooks } = useServices();
  const { deviceTz, now } = hooks.useClock();
  const zone = hooks.useSettings().timezone ?? deviceTz;
  return when.kind === "quick"
    ? (view.quickTimes.find((quick) => quick.key === when.key)?.at ?? now)
    : wallClockToIso(when.local, zone);
};

/** The close sheet's state: when, how exactly, the reason, and the two ways to record it. */
export const useCloseForm = ({ mode, onDone, view }: Options) => {
  const t = useT();
  const { actions, hooks } = useServices();
  const { byId } = hooks.useAppState((state) => state.tasks);
  const reasons = useMemo(() => recentReasons(byId), [byId]);
  const run = useRunAction();
  const [when, setWhen] = useState<When>({ key: "now", kind: "quick" });
  const [isExact, setIsExact] = useState(true);
  const [reason, setReason] = useState("");
  const sending = view.primaryAction.kind === "submit" ? view.primaryAction.subtaskIds : [];
  const at = useInstant(view, when);
  const precision = isExact ? "exact" : "approx";
  const preview =
    at === null
      ? null
      : closePreview({ at, dueAt: view.stats.dueAt, problems: view.problems, sending });
  const finish = async (instant: string): Promise<void> => {
    const events =
      mode === "submit"
        ? await run(
            actions.submit({ at: instant, precision, subtaskIds: sending, taskId: view.id }),
            { undo: t("close.submittedToast", { count: sending.length, title: view.title }) },
          )
        : await run(
            actions.closeTask({ at: instant, outcome: "done", precision, taskId: view.id }),
            {
              undo: t("close.closedToast", { outcome: t("outcome.done"), title: view.title }),
            },
          );
    if (events !== null) {
      onDone();
    }
  };
  const closeAs = async (instant: string, outcome: "cancelled" | "skipped"): Promise<void> => {
    const given = reason.trim() === "" ? undefined : reason;
    const events = await run(
      actions.closeTask({ at: instant, outcome, precision, reason: given, taskId: view.id }),
      { undo: t("close.closedToast", { outcome: t(`outcome.${outcome}`), title: view.title }) },
    );
    if (events !== null) {
      onDone();
    }
  };
  return {
    at,
    closeAs,
    finish,
    isExact,
    preview,
    reason,
    reasons,
    sending,
    setIsExact,
    setReason,
    setWhen,
    when,
  };
};
