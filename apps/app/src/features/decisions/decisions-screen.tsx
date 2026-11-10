import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { useAppState, useLanguage, usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useListVariant } from "#app/screens/pushed-screen.tsx";
import { useOpenTask } from "#app/shared/task-opener.tsx";
import { useBack } from "#app/shared/use-back.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { ListRow } from "#app/ui/list-row.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { type ListSection, SectionedList } from "#app/ui/sectioned-list.tsx";
import { Skeleton } from "#app/ui/skeleton.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { Text } from "#app/ui/text.tsx";
import { type DecisionView, decisionViews } from "@pace/client";
import { useDecisions } from "@pace/client/react";
import { formatInZone, formatRelativeDay } from "@pace/core";

/** One more line under a row's title: what was asked, answered or done. */
const Detail = ({
  children,
  tone = "secondary",
}: {
  readonly children: string;
  readonly tone?: "secondary" | "warn";
}) => (
  <Text role="footnote" tone={tone}>
    {children}
  </Text>
);

/** Everything under a row's first line: the request, the turns, the outcome and when and by whom. */
const RowDetails = ({ view }: { readonly view: DecisionView }) => {
  const t = useT();
  const viewer = useViewer();
  const [, ...more] = view.lines;
  const footer = [
    zonedText({ at: view.at, mode: "datetime", tz: viewer.deviceTz }, viewer),
    view.via,
  ].filter((part): part is string => part !== null);
  return (
    <View className="gap-0.5">
      {more.length === 0 ? null : <Text role="callout">{more.join("\n")}</Text>}
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
      <Text numeric role="caption" tone="tertiary">
        {footer.join(" · ")}
      </Text>
    </View>
  );
};

/** One message and what became of it; a row about a task opens that task. */
const DecisionRow = ({ view }: { readonly view: DecisionView }) => {
  const openTask = useOpenTask();
  const { taskId } = view;
  return (
    <ListRow
      meta={<RowDetails view={view} />}
      title={view.lines[0] ?? ""}
      titleLines={2}
      titleLook={{ className: "font-medium" }}
      {...(taskId !== null && {
        onPress: () => {
          openTask(taskId);
        },
        role: "button" as const,
      })}
    />
  );
};

/** The log could not load (or took too long): a quiet line and Try again under it. */
const LogFailed = ({ onRetry }: { readonly onRetry: () => void }) => {
  const t = useT();
  return (
    <EmptyState
      action={
        <Button onPress={onRetry} size="small" variant="secondary">
          {t("decisions.retry")}
        </Button>
      }
      title={t("decisions.failed")}
    />
  );
};

/** How long typing in the search pauses before the log is searched. */
const SEARCH_PAUSE_MS = 350;

/** The days of the log: «Today», «Yesterday», «28 Oct», newest first, as the log came. */
const daySections = (
  views: readonly DecisionView[],
  {
    language,
    now,
    tz,
  }: { readonly language: "en" | "ru"; readonly now: string; readonly tz: string },
): readonly ListSection<DecisionView>[] => {
  const sections: { key: string; rows: DecisionView[]; title: string }[] = [];
  for (const view of views) {
    const key = formatInZone(view.at, tz, "yyyy-MM-dd");
    const last = sections.at(-1);
    if (last?.key === key) {
      last.rows.push(view);
    } else {
      sections.push({
        key,
        rows: [view],
        title: formatRelativeDay(view.at, now, { language, tz }),
      });
    }
  }
  return sections;
};

/** What the list shows while it has no rows: loading, the failure, no match, or an empty log. */
const NothingToShow = ({
  isSearching,
  loaded,
  onClear,
  search,
}: {
  readonly loaded: ReturnType<typeof useDecisions>;
  readonly isSearching: boolean;
  readonly search: string;
  readonly onClear: () => void;
}) => {
  const t = useT();
  if (loaded.status === "failed") {
    return <LogFailed onRetry={loaded.reload} />;
  }
  if (loaded.status !== "loaded") {
    return <Skeleton label={t("sync.loadingData")} rows={6} />;
  }
  return isSearching ? (
    <EmptyState
      action={
        <Button onPress={onClear} size="small" variant="secondary">
          {t("decisions.clear")}
        </Button>
      }
      title={t("decisions.noMatch", { query: search.trim() })}
    />
  ) : (
    <EmptyState title={t("decisions.empty")} />
  );
};

/** The loaded log worded once per load or store change (the state indexed once for every row), by day. */
const useDaySections = (
  loaded: ReturnType<typeof useDecisions>,
): readonly ListSection<DecisionView>[] => {
  const language = useLanguage();
  const tasks = useAppState((state) => state.tasks);
  const time = useAppState((state) => state.time);
  const { deviceTz, now } = useViewer();
  return useMemo(
    () =>
      daySections(
        loaded.status === "loaded"
          ? decisionViews(loaded.decisions, { language, now, state: { tasks, time } })
          : [],
        { language, now, tz: deviceTz },
      ),
    [deviceTz, language, loaded, now, tasks, time],
  );
};

/** Every automatic decision (assistant readings, older notification decisions), searchable. */
export const DecisionsScreen = () => {
  const t = useT();
  const { api } = usePace();
  // Reached from Notifications: a pasted link goes back there, not to Now (R26-08).
  const back = useBack("/notifications");
  const variant = useListVariant();
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
  const sections = useDaySections(loaded);
  return (
    <Screen
      header={
        <>
          <ScreenHeader
            backLabel={t("common.back")}
            onBack={back}
            title={t("decisions.title")}
            variant={variant}
          />
          <View className="px-gutter pb-3 pt-1">
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
        </>
      }
      scroller={(scroll) => (
        <SectionedList
          empty={
            <NothingToShow
              isSearching={search.trim() !== ""}
              loaded={loaded}
              onClear={() => {
                setQuery("");
                setSearch("");
              }}
              search={search}
            />
          }
          renderRow={(view) => <DecisionRow view={view} />}
          rowKey={(view) => view.id}
          scroll={scroll}
          sections={sections}
        />
      )}
    />
  );
};
