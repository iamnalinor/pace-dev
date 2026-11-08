import { useState } from "react";

import type { QuickTimeKey, TaskViewModel } from "@pace/client";

import { fromWallClock, type WallClock, wallClock } from "#app/format/time.ts";
import { taskInstantProblem } from "@pace/core";

import type { CloseMode } from "./close-model.ts";

/** A pill, or the typed date and time. */
export type TimeChoice = "custom" | QuickTimeKey;

export type GiveUp = "cancelled" | "skipped";

export type CloseForm = {
  readonly mode: CloseMode;
  readonly setMode: (mode: CloseMode) => void;
  readonly choice: TimeChoice;
  readonly choose: (choice: TimeChoice) => void;
  readonly typed: WallClock;
  readonly setTyped: (typed: WallClock) => void;
  /** The chosen instant; `null` while the typed time is not a real one. */
  readonly at: null | string;
  /** Why the write would refuse that instant (the rule it applies); `null` when it takes it. */
  readonly problem: null | ReturnType<typeof taskInstantProblem>;
  readonly isExact: boolean;
  readonly setIsExact: (isExact: boolean) => void;
  readonly outcome: GiveUp;
  readonly setOutcome: (outcome: GiveUp) => void;
  readonly reason: string;
  readonly setReason: (reason: string) => void;
};

const MINUTE_MS = 60_000;

/**
A typed minute read as an instant: the minute the task was created in means its creation, not the
minute's first second, which comes before it (QA round 20 L4: the sheet's own default, this minute,
was refused as "before the task was created" during the task's first minute).
*/
const typedAt = (at: null | string, task: Pick<TaskViewModel, "createdAt">): null | string => {
  if (at === null) {
    return null;
  }
  const typed = Date.parse(at);
  const created = Date.parse(task.createdAt);
  const isCreationMinute = Math.floor(typed / MINUTE_MS) === Math.floor(created / MINUTE_MS);
  return isCreationMinute && typed < created ? task.createdAt : at;
};

/** The close sheet's state: which time, how precise, and how the task ends. */
export const useCloseForm = (
  view: TaskViewModel,
  { deviceTz, now }: { readonly deviceTz: string; readonly now: string },
  startMode: CloseMode = "done",
): CloseForm => {
  const [mode, setMode] = useState<CloseMode>(startMode);
  const [choice, setChoice] = useState<TimeChoice>("now");
  const [typed, setTyped] = useState<WallClock>({ date: "", time: "" });
  const [isExact, setIsExact] = useState(true);
  const [outcome, setOutcome] = useState<GiveUp>("cancelled");
  const [reason, setReason] = useState("");
  const pillAt = (key: TimeChoice): null | string =>
    view.quickTimes.find((quick) => quick.key === key)?.at ?? null;
  const at =
    choice === "custom" ? typedAt(fromWallClock({ ...typed, tz: deviceTz }), view) : pillAt(choice);
  const problem = at === null ? null : taskInstantProblem(view, at, now);
  const choose = (next: TimeChoice): void => {
    if (next === "custom" && choice !== "custom") {
      // The typed fields start from the time that was chosen, on this device's clock.
      setTyped(wallClock(at ?? view.quickTimes[0]?.at ?? new Date().toISOString(), deviceTz));
    }
    setChoice(next);
  };
  return {
    at,
    choice,
    choose,
    isExact,
    mode,
    outcome,
    problem,
    reason,
    setIsExact,
    setMode,
    setOutcome,
    setReason,
    setTyped,
    typed,
  };
};
