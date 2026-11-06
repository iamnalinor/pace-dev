import { useEffect, useState } from "react";
import { useStore } from "zustand";

import type { QueryContext } from "@pace/core";

import type { AppState, AppStateHandle } from "../state.ts";

import { completeHistoryOf, type HistoryCoordinator, type HistoryError } from "../history-types.ts";
import { type HistoryViewModel, historyViewModel } from "../view-models/history.ts";

export type HistoryResource =
  | { readonly status: "failed"; readonly error: HistoryError; readonly retry: () => void }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly value: HistoryViewModel };

type ViewHook = <T>(compute: (current: AppState, context: QueryContext) => T, key?: string) => T;
export const createHistoryHook = ({
  state,
  history,
  useView,
}: {
  readonly state: AppStateHandle;
  readonly history: HistoryCoordinator | undefined;
  readonly useView: ViewHook;
}): ((atIso: string) => HistoryResource) => {
  return (atIso) => {
    const coverage = useStore(state.store, (current) => current.historyCoverage);
    const copyToken = state.localCopy()?.copyToken;
    const storeId = state.localCopy()?.storeId;
    const [attempt, setAttempt] = useState(0);
    const status = useStore(state.store, (current) => current.historyStatus);
    const error = useStore(state.store, (current) => current.historyError);
    useEffect(() => {
      void history?.ensureComplete();
    }, [attempt, coverage, copyToken, storeId]);
    const value = useView((current, ctx) => {
      if (current.status !== "ready") {
        return null;
      }
      const source = completeHistoryOf(current);
      return source.ok ? historyViewModel(source.value, { atIso, deviceTz: ctx.deviceTz }) : null;
    }, atIso);
    if (value !== null) {
      return { status: "ready", value };
    }
    return status === "failed"
      ? {
          status: "failed",
          error: error ?? "history/unavailable",
          retry: () => {
            setAttempt((current) => current + 1);
          },
        }
      : { status: "loading" };
  };
};
