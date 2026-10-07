import type { ReactNode } from "react";

import { useRouter } from "expo-router";
import { Text } from "react-native";

import { useT } from "#app/app-state.tsx";
import { BackHeader } from "#app/ui/back-header.tsx";
import { Screen } from "#app/ui/screen.tsx";

/** A screen pushed over the tabs: a back chevron, its title, and the body. */
export const PushedScreen = ({
  children,
  right,
  title,
}: {
  readonly children: ReactNode;
  readonly right?: ReactNode;
  readonly title: string;
}) => {
  const t = useT();
  const router = useRouter();
  return (
    <Screen
      header={
        <BackHeader
          backLabel={t("common.back")}
          onBack={() => {
            router.back();
          }}
          right={right}
        >
          <Text accessibilityRole="header" className="font-sans text-[22px] font-semibold text-fg">
            {title}
          </Text>
        </BackHeader>
      }
    >
      {children}
    </Screen>
  );
};
