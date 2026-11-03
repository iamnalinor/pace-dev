import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useOpenTask } from "#app/shared/task-opener.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { FirstSyncBody } from "#app/ui/empty-state.tsx";
import { Icon } from "#app/ui/icon.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { type DecisionView, decisionViews } from "@pace/client";
import { useDecisions } from "@pace/client/react";

import { PushedScreen } from "./pushed-screen.tsx";

const Detail = ({
  children,
  tone = "plain",
}: {
  readonly children: string;
  readonly tone?: "plain" | "warn";
}) => (
  <Text
    className={`font-sans text-footnote ${tone === "warn" ? "text-warn" : "text-label-secondary"}`}
  >
    {children}
  </Text>
);

const RowBody = ({ view }: { readonly view: DecisionView }) => {
  const t = useT();
  const viewer = useViewer();
  const [title, ...more] = view.lines;
  const footer = [
    zonedText({ at: view.at, mode: "datetime", tz: viewer.deviceTz }, viewer),
    view.via,
  ].filter((part): part is string => part !== null);
  return (
    <>
      <Text className="font-sans text-callout font-medium text-label-primary">{title}</Text>
      {more.length === 0 ? null : (
        <Text className="font-sans text-callout text-label-primary">{more.join("\n")}</Text>
      )}
      {view.request === null ? null : (
        <Detail>{t("decisions.request", { text: view.request })}</Detail>
      )}
      {view.followups.map((followup, index) => (
        // The turns of a conversation never reorder: their place is their identity.
        <Detail key={`${String(index)}:${followup}`}>{followup}</Detail>
      ))}
      {view.outcome === null ? null : <Detail>{view.outcome}</Detail>}
      {view.notFound === null ? null : <Detail tone="warn">{view.notFound}</Detail>}
      {view.note === null ? null : <Detail>{view.note}</Detail>}
      <Text className="font-sans text-caption font-normal text-label-tertiary">
        {footer.join(" · ")}
      </Text>
    </>
  );
};

/** One message and what became of it; a row about a task opens that task. */
const DecisionRow = ({ view }: { readonly view: DecisionView }) => {
  const t = useT();
  const openTask = useOpenTask();
  const { taskId } = view;
  return taskId === null ? (
    <View className="gap-0.5 border-t border-separator py-3">
      <RowBody view={view} />
    </View>
  ) : (
    <Pressable
      accessibilityHint={t("decisions.open")}
      accessibilityRole="button"
      className="flex-row items-center gap-3 border-t border-separator py-3 active:opacity-70"
      onPress={() => {
        openTask(taskId);
      }}
    >
      <View className="flex-1 gap-0.5">
        <RowBody view={view} />
      </View>
      <Icon name="chevron-right" size="inline" tone="tertiary" />
    </Pressable>
  );
};

/** The log could not load (or took too long): a quiet line and Try again under it. */
const LogFailed = ({ onRetry }: { readonly onRetry: () => void }) => {
  const t = useT();
  return (
    <View className="items-start">
      <Text className="font-sans text-footnote text-label-secondary">{t("decisions.failed")}</Text>
      <View className="-ml-4">
        <Button onPress={onRetry} variant="ghost">
          {t("decisions.retry")}
        </Button>
      </View>
    </View>
  );
};

/** How long typing in the search pauses before the log is searched. */
const SEARCH_PAUSE_MS = 350;

/** Every automatic decision (assistant readings, older notification decisions), searchable. */
export const DecisionsScreen = () => {
  const t = useT();
  const { api } = usePace();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  // It searches while typing, once the typing pauses; Enter searches at once.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
    }, SEARCH_PAUSE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);
  const loaded = useDecisions(api, search);
  const language = useLanguage();
  const tasks = useAppState((state) => state.tasks);
  const time = useAppState((state) => state.time);
  const { now } = useViewer();
  // Worded once per load or store change, the state indexed once for every row.
  const views = useMemo(
    () =>
      loaded.status === "loaded"
        ? decisionViews(loaded.decisions, {
            language,
            now,
            state: { tasks, time },
          })
        : [],
    [language, loaded, now, tasks, time],
  );
  return (
    <PushedScreen title={t("decisions.title")}>
      <View className="px-4 pb-3">
        <TextField
          isLabelHidden
          label={t("decisions.search")}
          onChangeText={setQuery}
          onSubmitEditing={() => {
            setSearch(query);
          }}
          placeholder={t("decisions.search")}
          purpose="search"
          returnKeyType="search"
          value={query}
        />
      </View>
      <FirstSyncBody isWaiting={loaded.status === "loading"}>
        <View className="px-4">
          {loaded.status === "failed" ? <LogFailed onRetry={loaded.reload} /> : null}
          {loaded.status === "loaded" && views.length === 0 ? (
            <Text className="font-sans text-footnote text-label-secondary">
              {search.trim() === ""
                ? t("decisions.empty")
                : t("decisions.noMatch", { query: search.trim() })}
            </Text>
          ) : null}
          {views.map((view) => (
            <DecisionRow key={view.id} view={view} />
          ))}
        </View>
      </FirstSyncBody>
    </PushedScreen>
  );
};
