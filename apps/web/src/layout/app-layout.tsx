import { Outlet } from "react-router";

import { TabBar } from "#web/shared/ui/tab-bar.tsx";

import { Shortcuts } from "./shortcuts.tsx";
import { Sidebar } from "./sidebar.tsx";
import { TopNav } from "./top-nav.tsx";

/**
Three shapes: below 640px the artboards' phone column with the tab bar; 640–1023px one
wider column with the sections across the top; from 1024px a sidebar and a wide content
area where Now and a project open tasks beside the list.
*/
export const AppLayout = () => (
  <div className="flex min-h-dvh bg-bg">
    <Sidebar className="hidden lg:flex" />
    <div className="flex min-w-0 flex-1 flex-col">
      <TopNav className="hidden sm:flex lg:hidden" />
      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col sm:max-w-2xl lg:max-w-6xl lg:px-6 lg:pt-2">
        <Outlet />
      </div>
      <TabBar className="sticky bottom-0 z-30 bg-bg sm:hidden" />
    </div>
    <Shortcuts />
  </div>
);
