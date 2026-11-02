import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { Pressable, Text, View } from "react-native";

import { clipText } from "@pace/core";

import { cx } from "./cx.ts";
import { useIsWide } from "./layout.ts";

export type ToastInput = {
  readonly message: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
};

type Shown = ToastInput & { readonly id: number };

type ToastHandle = { readonly show: (toast: ToastInput) => void };

const ToastContext = createContext<null | ToastHandle>(null);

/**
A screen with a footer (the time bar) tells the toast how tall it is, so it floats above; null
takes it back. Each screen speaks for itself: on a wide window Now's list and the task pane
beside it both have one.
*/
type SetFooter = (screenId: string, height: null | number) => void;

const FooterHeightContext = createContext<SetFooter>(() => undefined);

/** The sidebar says it is there (`true`) or gone: a wide window's toast docks at its foot. */
const SidebarDockContext = createContext<(isDocked: boolean) => void>(() => undefined);

/**
Called by the sidebar: while it is on screen, toasts sit at its foot, below its links, where
they cover nothing (bug class 6). Floating over a screen's content, a toast lay over whatever
control was there (Settings' digest times on a computer).
*/
export const useDockToastsHere = (): void => {
  const setDocked = use(SidebarDockContext);
  useEffect(() => {
    setDocked(true);
    return () => {
      setDocked(false);
    };
  }, [setDocked]);
};

/**
Keeps the toast above this screen's footer while the screen is the one in front. A screen under
a pushed one or a tab left behind stays mounted, and must not lift the toast of the next one.
*/
export const useLiftToastAbove = (footerHeight: number, isActive: boolean): void => {
  const setFooter = use(FooterHeightContext);
  const screenId = useId();
  useEffect(() => {
    if (!isActive) {
      return;
    }
    setFooter(screenId, footerHeight);
    return () => {
      setFooter(screenId, null);
    };
  }, [footerHeight, isActive, screenId, setFooter]);
};

/** The footers of the screens in view, by screen: the toast clears the tallest. */
const useFooters = () => {
  const [footers, setFooters] = useState<Readonly<Record<string, number>>>({});
  const setFooter = useCallback<SetFooter>((screenId, height) => {
    setFooters(({ [screenId]: _gone, ...others }) =>
      height === null ? others : { ...others, [screenId]: height },
    );
  }, []);
  return { footerHeight: Math.max(0, ...Object.values(footers)), setFooter };
};

/**
Long enough to read a refusal or reach for its offer (about 60 ms a character, at least five
seconds), short enough not to cover a row for long (ten at most).
*/
const visibleMs = (message: string): number =>
  Math.min(10_000, Math.max(5000, message.length * 60));

/** What clears a phone's tab bar and leaves a little air above it. */
const BASE_BOTTOM = 96;
/** The phone's tab bar on its own, for a toast that has to clear a screen's footer as well. */
const TAB_BAR_HEIGHT = 72;
/** Air between the footer and the toast. */
const FOOTER_GAP = 12;

/** How far above the bottom edge the toast floats: clear of the tab bar and of any footer. */
const bottomAbove = (footerHeight: number, isWide: boolean): number => {
  if (footerHeight === 0) {
    return BASE_BOTTOM;
  }
  // A wide window has no tab bar under the footer.
  return (isWide ? 0 : TAB_BAR_HEIGHT) + footerHeight + FOOTER_GAP;
};

/** How far above the bottom edge a floating line sits: clear of the tab bar and any footer. */
const FloatBottomContext = createContext(BASE_BOTTOM);

/**
Where a status that floats over the page sits (the offline pill): low, clear of the tab bar and
of the screen's footer, as the toast does, so it covers no header control (round 7 review 3).
*/
export const useFloatBottom = (): number => use(FloatBottomContext);

/** Where a toast docked in the sidebar sits: inside its column (`w-sidebar-inner`), at its foot. */
const DOCKED = "bottom-4 left-3 w-sidebar-inner";
const FLOATING = "inset-x-4 mx-auto w-auto max-w-toast-max";

/**
How much of a value from data (a task title, an event, an action's summary) a toast quotes: about
two lines in the sidebar's column, one on a phone.
*/
export const TOAST_QUOTE_GRAPHEMES = 48;

/**
A value from data, quoted in a toast's sentence: cut short here, so the sentence itself is never
cut. The message is shown whole (UI text wraps, spec 4.1.2 rule 3): a clamp on the whole message
hid the end of the very sentence that explains a refused tap (QA round 18 R18-01).
*/
export const toastQuote = (value: string): string => clipText(value, TOAST_QUOTE_GRAPHEMES);

/**
The toast's card: its words in full and the one action. `ToastBar` places and announces it; the
gallery shows it. Docked in the sidebar the action goes under the text, so the text has the
column's whole width (QA round 17 L5: beside the action it had a hundred pixels).
*/
export const ToastCard = ({
  className,
  isDocked = false,
  onDone,
  toast,
}: {
  readonly className?: string;
  readonly isDocked?: boolean;
  readonly onDone: () => void;
  readonly toast: ToastInput;
}) => (
  <View
    className={cx(
      "rounded-xl border border-separator bg-elevated py-1 pl-4 shadow-lg",
      isDocked ? "flex-col items-stretch pr-2" : "flex-row items-center gap-3 pr-1",
      className,
    )}
  >
    {/* A tap on the text dismisses it. The words wrap to as many lines as they need. */}
    <Pressable className={isDocked ? "self-stretch" : "min-w-0 flex-1"} onPress={onDone}>
      <Text className="py-3 font-sans text-subhead font-normal text-label-primary">
        {toast.message}
      </Text>
    </Pressable>
    {toast.action === undefined ? null : (
      <Pressable
        accessibilityRole="button"
        className={cx(
          "h-hit-web shrink-0 justify-center rounded-md px-3 active:opacity-70",
          isDocked && "self-end",
        )}
        onPress={() => {
          // Closed first, so the action may show a toast of its own.
          onDone();
          toast.action?.onPress();
        }}
      >
        <Text className="font-sans text-subhead font-semibold text-accent-text">
          {toast.action.label}
        </Text>
      </Pressable>
    )}
  </View>
);

const ToastBar = ({
  bottom,
  isDocked,
  onDone,
  toast,
}: {
  readonly bottom: number;
  readonly isDocked: boolean;
  readonly onDone: () => void;
  readonly toast: Shown;
}) => (
  <View
    accessibilityLiveRegion="polite"
    accessibilityRole="alert"
    className={cx("absolute", isDocked ? DOCKED : FLOATING)}
    style={isDocked ? undefined : { bottom }}
    testID="toast"
  >
    <ToastCard isDocked={isDocked} onDone={onDone} toast={toast} />
  </View>
);

/** One toast at a time at the bottom of the screen; a new one replaces the current one. */
export const ToastProvider = ({ children }: { readonly children: ReactNode }) => {
  const [toast, setToast] = useState<null | Shown>(null);
  const { footerHeight, setFooter } = useFooters();
  const isWide = useIsWide();
  const [isDocked, setIsDocked] = useState(false);
  const floatBottom = useMemo(() => bottomAbove(footerHeight, isWide), [footerHeight, isWide]);
  const hide = useCallback(() => {
    setToast(null);
  }, []);
  useEffect(() => {
    if (toast === null) {
      return;
    }
    const timer = setTimeout(hide, visibleMs(toast.message));
    return () => {
      clearTimeout(timer);
    };
  }, [hide, toast]);
  const handle = useMemo<ToastHandle>(
    () => ({
      show: (input) => {
        setToast((current) => ({ ...input, id: (current?.id ?? 0) + 1 }));
      },
    }),
    [],
  );
  return (
    <ToastContext value={handle}>
      <FooterHeightContext value={setFooter}>
        <FloatBottomContext value={floatBottom}>
          <SidebarDockContext value={setIsDocked}>
            <View className="flex-1">
              {children}
              {toast === null ? null : (
                <ToastBar
                  bottom={bottomAbove(footerHeight, isWide)}
                  isDocked={isWide && isDocked}
                  key={toast.id}
                  onDone={hide}
                  toast={toast}
                />
              )}
            </View>
          </SidebarDockContext>
        </FloatBottomContext>
      </FooterHeightContext>
    </ToastContext>
  );
};

export const useToast = (): ToastHandle => {
  const handle = use(ToastContext);
  if (handle === null) {
    throw new Error("useToast needs a ToastProvider above it");
  }
  return handle;
};
