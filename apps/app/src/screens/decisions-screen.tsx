import { ChevronRight } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useOpenTask } from "#app/shared/task-opener.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { type DecisionView, decisionViews } from "@pace/client";
import { useDecisions } from "@pace/client/react";

import { PushedScreen } from "./pushed-screen.tsx";

const Detail = ({
  children,
  tone = "fg2",
}: {
  readonly children: string;
  readonly tone?: "fg2" | "warn";
}) => (
  <Text className={`font-sans text-[13px] leading-5 ${tone === "warn" ? "text-warn" : "text-fg2"}`}>
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
      <Text className="font-sans text-[15px] font-medium leading-5 text-fg">{title}</Text>
      {more.length === 0 ? null : (
        <Text className="font-sans text-[15px] leading-5 text-fg">{more.join("\n")}</Text>
      )}
      {view.request === null ? null : (
        <Detail>{t("decisions.request", { text: view.request })}</Detail>
      )}
      {view.outcome === null ? null : <Detail>{view.outcome}</Detail>}
      {view.notFound === null ? null : <Detail tone="warn">{view.notFound}</Detail>}
      {view.note === null ? null : <Detail>{view.note}</Detail>}
      <Text className="font-sans text-[12px] text-muted">{footer.join(" · ")}</Text>
    </>
  );
};

/** One message and what became of it; a row about a task opens that task. */
const DecisionRow = ({ view }: { readonly view: DecisionView }) => {
  const t = useT();
  const openTask = useOpenTask();
  const { palette } = useTheme();
  const { taskId } = view;
  return taskId === null ? (
    <View className="gap-0.5 border-t border-line py-2.5">
      <RowBody view={view} />
    </View>
  ) : (
    <Pressable
      accessibilityHint={t("decisions.open")}
      accessibilityRole="button"
      className="flex-row items-center gap-3 border-t border-line py-2.5 active:opacity-70"
      onPress={() => {
        openTask(taskId);
      }}
    >
      <View className="flex-1 gap-0.5">
        <RowBody view={view} />
      </View>
      <ChevronRight color={palette.faint} size={16} strokeWidth={1.75} />
    </Pressable>
  );
};

/** Every automatic decision (assistant readings, older notification decisions), searchable. */
export const DecisionsScreen = () => {
  const t = useT();
  const { api } = usePace();
  const { palette } = useTheme();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const loaded = useDecisions(api, search);
  const language = useLanguage();
  const tasks = useAppState((state) => state.tasks);
  const time = useAppState((state) => state.time);
  // Worded once per load or store change, the state indexed once for every row.
  const views = useMemo(
    () =>
      loaded.status === "loaded"
        ? decisionViews(loaded.decisions, { language, state: { tasks, time } })
        : [],
    [language, loaded, tasks, time],
  );
  return (
    <PushedScreen title={t("decisions.title")}>
      <View className="px-4 pb-3">
        <TextInput
          accessibilityLabel={t("decisions.search")}
          className="min-h-11 rounded-lg border border-line bg-surface px-3 font-sans text-[15px] text-fg"
          onChangeText={setQuery}
          onSubmitEditing={() => {
            setSearch(query);
          }}
          placeholder={t("decisions.search")}
          placeholderTextColor={palette.muted}
          returnKeyType="search"
          value={query}
        />
      </View>
      <View className="px-4">
        {loaded.status === "failed" ? (
          <Text className="font-sans text-[13px] text-muted">{t("decisions.failed")}</Text>
        ) : null}
        {loaded.status === "loaded" && loaded.decisions.length === 0 ? (
          <Text className="font-sans text-[13px] text-muted">{t("decisions.empty")}</Text>
        ) : null}
        {views.map((view) => (
          <DecisionRow key={view.id} view={view} />
        ))}
      </View>
    </PushedScreen>
  );
};
