import type { ReactNode } from "react";

import { useT } from "#app/app-state.tsx";
import { useBack } from "#app/shared/use-back.ts";
import { BackHeader, HeaderTitle } from "#app/ui/back-header.tsx";
import { Screen } from "#app/ui/screen.tsx";

/**
A screen pushed over the tabs: a back chevron, its title, and the body. Beside the sidebar
(a wide window) History, Settings and the other sidebar destinations are top level, without it.
*/
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
  const back = useBack();
  return (
    <Screen
      header={
        <BackHeader
          backLabel={t("common.back")}
          right={right}
          {...(back !== undefined && { onBack: back })}
        >
          <HeaderTitle>{title}</HeaderTitle>
        </BackHeader>
      }
    >
      {children}
    </Screen>
  );
};
