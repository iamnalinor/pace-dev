import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { QueryContext } from "@pace/core";

import type { AppState, AppStateHandle } from "../state.ts";

import { type Clock, queryContext } from "../clock.ts";
import { shareEqual } from "./share-equal.ts";

/** Relative times ("5 h ago", "due today") drift slowly: half a minute is fine. */
export const TICK_MS = 30_000;

/**
Whether a component's screen is the one in front, as a handle that never changes: asked when the
store or the clock moves and listened to, so leaving or entering a screen renders nothing by itself.
*/
export type Liveness = {
  readonly isLive: () => boolean;
  readonly subscribe: (listener: () => void) => () => void;
};

const NEVER = (): void => undefined;

export const ALWAYS_LIVE: Liveness = { isLive: () => true, subscribe: () => NEVER };

export type ViewHook = <T>(
  compute: (current: AppState, context: QueryContext) => T,
  key?: string,
) => T;

type ViewDeps = {
  readonly state: AppStateHandle;
  readonly clock: Clock;
  /** The handle of the component's screen (the app's `useScene`). */
  readonly useLiveness: () => Liveness;
};

/** The clock's tick while in front; a tick missed behind is taken once in front again. */
const useLiveTick = (clock: Clock, liveness: Liveness): QueryContext => {
  const [tick, setTick] = useState(() => queryContext(clock));
  useEffect(() => {
    const missed = { isTick: false };
    const take = (): void => {
      missed.isTick = !liveness.isLive();
      if (!missed.isTick) {
        setTick(queryContext(clock));
      }
    };
    const timer = setInterval(take, TICK_MS);
    const forget = liveness.subscribe(() => {
      if (missed.isTick) {
        take();
      }
    });
    return () => {
      clearInterval(timer);
      forget();
    };
  }, [clock, liveness]);
  return tick;
};

/**
A view-model, computed again when the store or the clock moves while its screen is in front (a
recompute reads the clock afresh: an activity started a second ago must already count as running,
not wait for the next tick). A view on a screen left behind (another tab, a screen under a pushed
one) is not computed and renders nothing until it is in front again, when it reads the store as
it is then, if it moved.

It is computed where React asks the store for its snapshot, and shares every unchanged part with
the one before (`shareEqual`): a store change that leaves the view as it was renders nothing, and
one that changes a row hands every other row the same object, so only that row is rendered
(bug-lessons 310). `key` names what `compute` closes over (a date, a task id).
*/
export const createViewHook =
  ({ clock, state, useLiveness }: ViewDeps): ViewHook =>
  <T>(compute: (current: AppState, context: QueryContext) => T, key = ""): T => {
    /** What was computed last, and the store's version, the tick and the key it was computed for. */
    type Computed = {
      at: null | { readonly key: string; readonly tick: QueryContext; readonly version: number };
      value: T | undefined;
    };
    const liveness = useLiveness();
    const tick = useLiveTick(clock, liveness);
    const [last] = useState<Computed>(() => ({ at: null, value: undefined }));
    const subscribe = useCallback(
      (notify: () => void) => {
        const forgetStore = state.store.subscribe(notify);
        const forgetLiveness = liveness.subscribe(notify);
        return () => {
          forgetStore();
          forgetLiveness();
        };
      },
      [liveness],
    );
    const read = (): T => {
      const { at } = last;
      // Behind, the store is not followed: the version the view was computed for stands.
      const version =
        at === null || liveness.isLive() ? state.store.getState().version : at.version;
      if (at?.version === version && at.tick === tick && at.key === key) {
        return last.value as T;
      }
      const next = shareEqual(last.value, compute(state.store.getState(), queryContext(clock)));
      last.at = { key, tick, version };
      last.value = next;
      return next;
    };
    return useSyncExternalStore(subscribe, read, read);
  };
