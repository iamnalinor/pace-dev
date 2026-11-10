import { useEffect, useRef } from "react";
import { AccessibilityInfo } from "react-native";

import type { RunningView } from "@pace/client";

import { useT } from "#app/app-state.tsx";

const isPast = (running: RunningView): boolean => running.status === "long";

type Known = ReadonlyMap<string, { readonly label: string; readonly wasPast: boolean }>;

/** What changed since `before`, in words: starts, activities now past their Expect, and stops. */
const news = (
  before: Known,
  running: readonly RunningView[],
  say: ReturnType<typeof useT>,
): readonly string[] => {
  const spoken: string[] = [];
  for (const item of running) {
    const was = before.get(item.activityId);
    if (was === undefined) {
      spoken.push(say("time.announce.started", { label: item.label }));
    } else if (isPast(item) && !was.wasPast) {
      spoken.push(say("time.announce.long", { label: item.label }));
    }
  }
  const ids = new Set(running.map((item) => item.activityId));
  for (const [id, gone] of before) {
    if (!ids.has(id)) {
      spoken.push(say("time.announce.stopped", { label: gone.label }));
    }
  }
  return spoken;
};

/**
Says what the running card does not say by itself (F-A11Y-10: it is no live region, so the ticking
time stays silent): an activity started, an activity stopped, and one gone past its Expect, each
once. What is there when the bar first mounts is not news and is not announced.
*/
export const useRunningAnnouncements = (running: readonly RunningView[]): void => {
  const t = useT();
  const tRef = useRef(t);
  const knownRef = useRef<Known | null>(null);
  useEffect(() => {
    tRef.current = t;
  });
  useEffect(() => {
    const before = knownRef.current;
    knownRef.current = new Map(
      running.map((item) => [item.activityId, { label: item.label, wasPast: isPast(item) }]),
    );
    if (before === null) {
      return;
    }
    for (const text of news(before, running, tRef.current)) {
      AccessibilityInfo.announceForAccessibility(text);
    }
  }, [running]);
};
