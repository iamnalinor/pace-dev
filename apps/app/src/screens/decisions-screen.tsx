import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import type { Decision } from "@pace/core";

import { usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { decisionLabelKey } from "@pace/client";
import { useDecisions } from "@pace/client/react";

import { PushedScreen } from "./pushed-screen.tsx";

const DecisionRow = ({ decision }: { readonly decision: Decision }) => {
  const t = useT();
  const viewer = useViewer();
  const label = (group: "kind" | "outcome", value: string): string => {
    const key = decisionLabelKey(group, value);
    return key === null ? value : t(key);
  };
  return (
    <View className="gap-0.5 border-t border-line py-2.5">
      <Text className="font-sans text-[14px] text-fg">
        {[label("kind", decision.kind), decision.rule, label("outcome", decision.outcome)].join(
          " · ",
        )}
      </Text>
      <Text className="font-sans text-[13px] text-fg2">{decision.explanation}</Text>
      <Text className="font-sans text-[12px] text-muted">
        {zonedText({ at: decision.at, mode: "datetime", tz: viewer.deviceTz }, viewer)}
      </Text>
    </View>
  );
};

/** Every automatic decision (notifications sent or held back, assistant readings), searchable. */
export const DecisionsScreen = () => {
  const t = useT();
  const { api } = usePace();
  const { palette } = useTheme();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const loaded = useDecisions(api, search);
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
        {loaded.status === "loaded"
          ? loaded.decisions.map((decision) => (
              <DecisionRow decision={decision} key={decision.id} />
            ))
          : null}
      </View>
    </PushedScreen>
  );
};
