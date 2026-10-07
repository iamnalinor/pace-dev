import { useState } from "react";

import type { QuickTimeKey, TaskViewModel } from "@pace/client";

import { fromWallClock, type WallClock, wallClock } from "#app/format/time.ts";

import { type CloseMode, initialMode } from "./close-model.ts";

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
  readonly isExact: boolean;
  readonly setExact: (exact: boolean) => void;
  readonly outcome: GiveUp;
  readonly setOutcome: (outcome: GiveUp) => void;
  readonly reason: string;
  readonly setReason: (reason: string) => void;
};

/** The close sheet's state: which time, how precise, and how the task ends. */
export const useCloseForm = (
  view: TaskViewModel,
  deviceTz: string,
  startMode?: CloseMode,
): CloseForm => {
  const [mode, setMode] = useState<CloseMode>(() => startMode ?? initialMode(view));
  const [choice, setChoice] = useState<TimeChoice>("now");
  const [typed, setTyped] = useState<WallClock>({ date: "", time: "" });
  const [isExact, setExact] = useState(true);
  const [outcome, setOutcome] = useState<GiveUp>("cancelled");
  const [reason, setReason] = useState("");
  const pillAt = (key: TimeChoice): null | string =>
    view.quickTimes.find((quick) => quick.key === key)?.at ?? null;
  const at = choice === "custom" ? fromWallClock({ ...typed, tz: deviceTz }) : pillAt(choice);
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
    reason,
    setExact,
    setMode,
    setOutcome,
    setReason,
    setTyped,
    typed,
  };
};
