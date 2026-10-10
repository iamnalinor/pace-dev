import type { ReactNode } from "react";

import { usePathname, useRouter } from "expo-router";

import { useT } from "#app/app-state.tsx";
import { BackHeader, HeaderTitle } from "#app/ui/back-header.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { Screen } from "#app/ui/screen.tsx";
import { isSidebarPath } from "#app/ui/sidebar.tsx";

/**
A screen pushed over the tabs: a back chevron, its title, and the body. Beside the sidebar
(a wide window) Inbox, History and Settings are destinations of their own, without the chevron.
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
  const router = useRouter();
  const isWide = useIsWide();
  const path = usePathname();
  const isTopLevel = isWide && isSidebarPath(path);
  const back = (): void => {
    // A link opened straight on this screen (the web) has nothing to go back to.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };
  return (
    <Screen
      header={
        <BackHeader
          backLabel={t("common.back")}
          right={right}
          {...(!isTopLevel && { onBack: back })}
        >
          <HeaderTitle>{title}</HeaderTitle>
        </BackHeader>
      }
    >
      {children}
    </Screen>
  );
};
