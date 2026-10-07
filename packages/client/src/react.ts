/** React bindings for @pace/client (works in React DOM and React Native). */
import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";

import {
  type Decision,
  endpoints,
  type Language,
  type NowListOptions,
  type PresetError,
  type QueryContext,
  type Result,
  type Settings,
} from "@pace/core";

import type { ApiClient } from "./api-client.ts";
import type { AiOutcome, Assistant } from "./assistant.ts";
import type { AppState, AppStateHandle } from "./state.ts";
import type { AiReading } from "./view-models/ai-reading.ts";

import { type Clock, queryContext, systemClock } from "./clock.ts";
import { type ComposerDraft, composerModel, type ComposerModel } from "./view-models/composer.ts";
import { type HistoryViewModel, historyViewModel } from "./view-models/history.ts";
import { type InboxViewModel, inboxViewModel } from "./view-models/inbox.ts";
import { type NowViewModel, nowViewModel } from "./view-models/now.ts";
import { type ProjectViewModel, projectViewModel } from "./view-models/project.ts";
import { type ReviewViewModel, reviewViewModel } from "./view-models/review.ts";
import { type TaskViewModel, taskViewModel } from "./view-models/task.ts";

export { useStore } from "zustand";

export type AppHooks = {
  readonly useAppState: <T>(selector: (state: AppState) => T) => T;
  readonly useSettings: () => Settings;
  readonly useLanguage: () => Language;
  /** The query context, refreshed every 30 s so relative times stay right. */
  readonly useClock: () => QueryContext;
  readonly useNow: (options?: NowListOptions) => NowViewModel;
  readonly useTaskView: (taskId: string) => Result<TaskViewModel, "task/unknown" | PresetError>;
  readonly useProjectView: (projectId: string) => Result<ProjectViewModel, "project/unknown">;
  readonly useInbox: () => InboxViewModel;
  readonly useReview: () => ReviewViewModel;
  readonly useHistory: (atIso: string) => HistoryViewModel;
  /** The composer's live chips for the typed line and the user's taps. */
  readonly useComposer: (draft: ComposerDraft) => ComposerModel;
};

/** Relative times ("5 h ago", "due today") drift slowly: half a minute is fine. */
const TICK_MS = 30_000;

/** Hooks bound to one app state, so screens never pass the store around. */
export const createAppHooks = (state: AppStateHandle, clock: Clock = systemClock()): AppHooks => {
  const useVersion = (): number => useStore(state.store, (current) => current.version);
  const useClock = (): QueryContext => {
    const [ctx, setCtx] = useState(() => queryContext(clock));
    useEffect(() => {
      const timer = setInterval(() => {
        setCtx(queryContext(clock));
      }, TICK_MS);
      return () => {
        clearInterval(timer);
      };
    }, []);
    return ctx;
  };
  /** Recomputes a view-model when the store or the clock moves. */
  const useView = <T>(compute: (current: AppState, ctx: QueryContext) => T, key = ""): T => {
    const version = useVersion();
    const ctx = useClock();
    // `version` and `key` are the inputs that matter; the store is read on demand.
    return useMemo(() => compute(state.store.getState(), ctx), [version, ctx, key]);
  };
  return {
    useAppState: (selector) => useStore(state.store, selector),
    useClock,
    useComposer: (draft) =>
      useView((current, ctx) => composerModel(current, draft, ctx), JSON.stringify(draft)),
    useHistory: (atIso) =>
      useView(
        (current, ctx) => historyViewModel(current, { atIso, deviceTz: ctx.deviceTz }),
        atIso,
      ),
    useInbox: () => useView(inboxViewModel),
    useLanguage: () => useStore(state.store, (current) => current.settings.language),
    useNow: (options) =>
      useView((current, ctx) => nowViewModel(current, ctx, options), options?.projectId ?? ""),
    useProjectView: (projectId) =>
      useView((current, ctx) => projectViewModel(current, projectId, ctx), projectId),
    useReview: () => useView(reviewViewModel),
    useSettings: () => useStore(state.store, (current) => current.settings),
    useTaskView: (taskId) => useView((current, ctx) => taskViewModel(current, taskId, ctx), taskId),
  };
};

/** Where the assistant's reading of a composer line stands. */
export type AiState =
  | Exclude<AiOutcome, { status: "read" }>
  | { readonly status: "idle" }
  | { readonly status: "read"; readonly reading: AiReading }
  | { readonly status: "reading" };

export type AiRead = {
  readonly state: AiState;
  /** Asks the assistant; `onReading` receives the chips it filled. */
  readonly read: (text: string, onReading: (reading: AiReading) => void) => Promise<void>;
  readonly reset: () => void;
};

/** "Read with AI" in a composer: one request per press, nothing written until the user adds. */
export const useAiRead = (assistant: Assistant): AiRead => {
  const [state, setState] = useState<AiState>({ status: "idle" });
  return {
    read: async (text, onReading) => {
      setState({ status: "reading" });
      const outcome = await assistant.read(text);
      if (outcome.status === "read") {
        onReading(outcome.reading);
      }
      setState(outcome);
    },
    reset: () => {
      setState({ status: "idle" });
    },
    state,
  };
};

const DECISIONS_LIMIT = 100;

export type DecisionsState =
  | { readonly status: "failed" }
  | { readonly status: "loaded"; readonly decisions: readonly Decision[] }
  | { readonly status: "loading" };

/** The decision log from the server, newest first, filtered by `search` (refetched when it changes). */
export const useDecisions = (api: ApiClient, search: string): DecisionsState => {
  const [loaded, setLoaded] = useState<DecisionsState>({ status: "loading" });
  useEffect(() => {
    const status = { isCurrent: true };
    void (async () => {
      try {
        const q = search.trim();
        const { decisions } = await api.call(endpoints.decisions.list, {
          query: { limit: DECISIONS_LIMIT, ...(q !== "" && { q }) },
        });
        if (status.isCurrent) {
          setLoaded({ decisions, status: "loaded" });
        }
      } catch {
        if (status.isCurrent) {
          setLoaded({ status: "failed" });
        }
      }
    })();
    return () => {
      status.isCurrent = false;
    };
  }, [api, search]);
  return loaded;
};
