import { type ReactNode, useState } from "react";
import { View } from "react-native";

import type { MessageKey } from "@pace/core";

import { useLanguage, useT } from "../app-state.tsx";
import { EmptyState } from "../ui/empty-state.tsx";
import { ScreenHeader } from "../ui/screen-header.tsx";

/** `Tue · Oct 6` in the account language. */
export const formatEyebrowDate = (date: Date, language: string): string => {
  const weekday = new Intl.DateTimeFormat(language, { weekday: "short" }).format(date);
  const day = new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }).format(date);
  return `${weekday} · ${day}`;
};

/** A tab screen before its feature lands: the artboard header plus an empty state. */
export const PlaceholderScreen = ({
  emptyKey,
  isDated = false,
  right,
  titleKey,
}: {
  readonly emptyKey: MessageKey;
  readonly isDated?: boolean;
  readonly right?: ReactNode;
  readonly titleKey: MessageKey;
}) => {
  const t = useT();
  const language = useLanguage();
  const [today] = useState(() => new Date());
  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        {...(isDated && { eyebrow: formatEyebrowDate(today, language) })}
        right={right}
        title={t(titleKey)}
      />
      <EmptyState>{t(emptyKey)}</EmptyState>
    </View>
  );
};
