import { type ReactNode, useRef, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePaneFocus } from "../platform/pane-focus.ts";
import { useContentRegionLayout } from "./float-layer.ts";
import { HOTKEYS } from "./hotkeys.ts";
import { useIsWide } from "./layout.ts";
import { Presence } from "./presence.tsx";
import { useHotkey } from "./use-hotkey.tsx";

export type ShellProps = {
  /** The navigation region (`Navigation`: sidebar, rail or nothing); left out by a nested shell. */
  readonly navigation?: ReactNode;
  readonly content: ReactNode;
  /**
  The app's own shell, not a screen's nested one: on the web its content is the page's `main`
  landmark with the skip link before it, on a phone too, where the shell carries no navigation
  region (the tab bar is inside the content).
  */
  readonly isRoot?: boolean;
  /** The detail of what is selected (Now, Week, Inbox); shown beside the content on `expanded`. */
  readonly inspector?: ReactNode;
  /** Whether something is selected: closed, the content keeps the whole width (F-LAY-03). */
  readonly inspectorOpen?: boolean;
  /** What the inspector holds, for screen readers ("Details"). */
  readonly inspectorLabel?: string;
  /** Closes what the inspector shows: Escape calls it while the pane is open (UI review I4). */
  readonly onInspectorClose?: () => void;
};

/**
The pane's own frame while it is drawn: Escape closes what it shows, and focus moves into it as it
opens and back to the control that opened it as it closes (UI review I4). One wrapper for every
inspector (Now, Inbox, Week, Day), so none of them can miss it.
*/
const InspectorFrame = ({
  children,
  isShown,
  label,
  onClose,
}: {
  readonly children: ReactNode;
  readonly isShown: boolean;
  readonly label: string | undefined;
  readonly onClose: (() => void) | undefined;
}) => {
  const paneRef = useRef<View>(null);
  useHotkey(isShown && onClose !== undefined ? HOTKEYS.escape : undefined, () => {
    onClose?.();
  });
  usePaneFocus(paneRef, isShown);
  return (
    <View
      accessibilityLabel={label}
      className="h-full w-inspector min-w-inspector-min max-w-inspector-max border-l border-separator bg-app"
      ref={paneRef}
      role="region"
    >
      {children}
    </View>
  );
};

/**
The inspector region (spec §4.2.25, §6 row → inspector): at the trailing edge at
`inspector.width` (360–480), a `separator` on its leading edge, a labelled region. Only on an
`expanded` window: it slides 16 in from the trailing edge with a fade when something is picked
and back out when nothing is (220 / 160), keeping what it last showed through the exit; elsewhere
the selection opens in a sheet, so nothing is drawn.
*/
export const Inspector = ({
  inspector,
  inspectorLabel,
  inspectorOpen = false,
  onInspectorClose,
}: Pick<ShellProps, "inspector" | "inspectorLabel" | "inspectorOpen" | "onInspectorClose">) => {
  const isWide = useIsWide();
  // What the pane last showed: it stays through the exit, after the screen has let go of it.
  const [kept, setKept] = useState<ReactNode>(inspector);
  if (inspector !== undefined && inspector !== kept) {
    setKept(inspector);
  }
  const isShown = inspectorOpen && inspector !== undefined;
  return isWide ? (
    <Presence
      enter="slide"
      onExited={() => {
        setKept(undefined);
      }}
      show={isShown}
    >
      <InspectorFrame isShown={isShown} label={inspectorLabel} onClose={onInspectorClose}>
        {kept}
      </InspectorFrame>
    </Presence>
  ) : null;
};

/**
The content region's `onLayout` for the shell beside the navigation: it tells the toast layer
where the region is, so the toast and the offline pill float in it, never across the sidebar or
the rail (R23-13a). A shell without the navigation (Week's own) leaves the root's word standing.
*/
export const useRegionLayout = (hasNavigation: boolean) => {
  const onLayout = useContentRegionLayout(hasNavigation);
  return hasNavigation ? { onLayout } : {};
};

/** The shell's outer frame: the side insets keep the rail and the content off the cutout. */
export const useShellInsets = () => {
  const insets = useSafeAreaInsets();
  return { paddingLeft: insets.left, paddingRight: insets.right };
};
