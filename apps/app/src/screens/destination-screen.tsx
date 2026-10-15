import type { ReactNode } from "react";

import { useT } from "#app/app-state.tsx";
import { useBack } from "#app/shared/use-back.ts";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";

/**
A destination of the sidebar that a phone reaches through More (Projects, Insights, Settings):
the big header of a main screen, with a back chevron to More on a phone and none beside the
sidebar.
*/
export const DestinationScreen = ({
  children,
  eyebrow,
  right,
  title,
}: {
  readonly children: ReactNode;
  readonly eyebrow?: string;
  readonly right?: ReactNode;
  readonly title: string;
}) => {
  const t = useT();
  const back = useBack();
  return (
    <Screen
      header={
        <ScreenHeader
          {...(back !== undefined && { backLabel: t("common.back"), onBack: back })}
          {...(eyebrow !== undefined && { eyebrow })}
          right={right}
          title={title}
        />
      }
    >
      {children}
    </Screen>
  );
};
