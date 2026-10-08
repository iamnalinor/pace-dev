import { useState } from "react";
import { Outlet } from "react-router";

import { DockContext } from "#web/shared/ui/dock.tsx";
import { TabBar } from "#web/shared/ui/tab-bar.tsx";

import { Shortcuts } from "./shortcuts.tsx";
import { Sidebar } from "./sidebar.tsx";
import { TopNav } from "./top-nav.tsx";

// From 1024px the content uses the screen: up to 1600px wide, so two panes never leave a
// wide empty margin while the list beside them is squeezed.
const COLUMN = "mx-auto w-full max-w-[430px] sm:max-w-2xl lg:max-w-[1600px] lg:px-8";

/**
Three shapes: below 640px the artboards' phone column with the tab bar; 640–1023px one
wider column with the sections across the top; from 1024px a sidebar and a wide content
area where Now and a project open tasks beside the list. The dock (the time bar on Now) is
pinned to the bottom, above the tab bar, where a thumb reaches it.
*/
export const AppLayout = () => {
  const [dock, setDock] = useState<HTMLElement | null>(null);
  return (
    <div className="flex min-h-dvh bg-bg">
      <Sidebar className="hidden lg:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav className="hidden sm:flex lg:hidden" />
        <DockContext value={dock}>
          <div className={`${COLUMN} flex flex-1 flex-col lg:pt-2`}>
            <Outlet />
          </div>
        </DockContext>
        <div className="sticky bottom-0 z-30 bg-bg">
          <div className={COLUMN} ref={setDock} />
          <TabBar className="sm:hidden" />
        </div>
      </div>
      <Shortcuts />
    </div>
  );
};
