import type { Href } from "expo-router";
import type { ReactNode } from "react";

import { useT } from "#app/app-state.tsx";
import { useBack } from "#app/shared/use-back.ts";
import { type HeaderVariant, ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";

export type HeadedScreenProps = {
  readonly children: ReactNode;
  readonly actions?: ReactNode;
  /** Where Back goes when there is nothing to go back to (a pasted link): Now by default. */
  readonly parent?: Href;
  readonly title: string;
};

/** A screen with its kit header and Back where there is one to offer (`useBack`). */
export const HeadedScreen = ({
  actions,
  children,
  header,
  parent,
  scrollLabel,
  title,
  variant,
}: HeadedScreenProps & {
  readonly variant: HeaderVariant;
  /** The top-level header's subtitle row (`subtitle`, `period`). */
  readonly header?: { readonly period?: ReactNode; readonly subtitle?: string | undefined };
  /** The body holds no control: it is a keyboard stop of this name (see `Screen`). */
  readonly scrollLabel?: string | undefined;
}) => {
  const t = useT();
  const back = useBack(parent);
  return (
    <Screen
      header={
        <ScreenHeader
          {...header}
          actions={actions}
          backLabel={t("common.back")}
          onBack={back}
          title={title}
          variant={variant}
        />
      }
      {...(scrollLabel !== undefined && { scrollLabel })}
    >
      {children}
    </Screen>
  );
};
