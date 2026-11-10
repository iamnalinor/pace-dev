import type { ReactNode } from "react";

import { View } from "react-native";

import { Group } from "#app/ui/group.tsx";
import { SectionHeader } from "#app/ui/section-header.tsx";

/**
One Insights section (spec §5.15): a `SectionHeader` over its content on the cell ground, named
for screen readers. A chart sits in padded content; a table passes its `ListRow`s with `isTable`,
and they form a `Group` themselves. No card in a card, no border (F-LAY-05).
*/
export const Card = ({
  children,
  isTable = false,
  title,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly isTable?: boolean;
}) => (
  <View accessibilityLabel={title} role="group">
    <SectionHeader title={title} />
    {isTable ? (
      <Group>{children}</Group>
    ) : (
      <View className="mx-gutter gap-3 rounded-lg bg-cell px-row-x py-row-y">{children}</View>
    )}
  </View>
);
