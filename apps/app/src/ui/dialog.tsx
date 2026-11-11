import { type ReactNode, useId } from "react";
import { Modal, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { shadow } from "@pace/core";

import type { SheetName } from "./sheet-names.ts";

import { paletteVars } from "../platform/theme.ts";
import { cx } from "./cx.ts";
import {
  overlayClosers,
  OverlayContent,
  OverlayLayer,
  Scrim,
  useOverlayProgress,
} from "./overlay-frame.tsx";
import { DIALOG_SCALE, grownScale } from "./overlay-motion.ts";
import { useOverlayPhase } from "./overlay-presence.tsx";
import { useScrim } from "./scrim.ts";
import { useSheetFocusRef } from "./sheet-focus.ts";
import { useTheme } from "./theme-provider.tsx";

/** A form's width (`layout.dialog`, 560) or a confirmation's (`inspector.width`, 400). */
export type DialogWidth = "confirm" | "form";

export type DialogProps = {
  readonly children: ReactNode;
  readonly closeLabel: string;
  /** Stays under the scrolling body (a long form keeps its buttons in sight). */
  readonly footer?: ReactNode;
  /** The overlay is a form (its fields and the footer's buttons), named this. */
  readonly formLabel?: string | undefined;
  /** Stays under the title, above the scrolling body: a picker's Stop, its switch, its search. */
  readonly header?: ReactNode;
  /** Which sheet this is: its name in the registry the e2e sweep opens every sheet from. */
  readonly name: SheetName;
  readonly onClose: () => void;
  readonly open: boolean;
  /** A dragged, dimmed-away or Backed-away close: false keeps it open (the cross still closes). */
  readonly dismissible?: boolean | undefined;
  readonly subtitle?: string | undefined;
  readonly title: string;
  readonly width?: DialogWidth | undefined;
};

/** The enter and exit of a dialog: scale 0.96 → 1 with a fade in, 1 → 0.98 with a fade out (§6). */
const useDialogMotion = (isOpen: boolean, letGo: () => void) => {
  const { isReduced, progress } = useOverlayProgress("dialog", isOpen, letGo);
  const style = useAnimatedStyle(() => {
    const step = progress.get();
    if (isReduced) {
      return { opacity: step };
    }
    const from = isOpen ? DIALOG_SCALE.enter : DIALOG_SCALE.exit;
    return { opacity: step, transform: [{ scale: grownScale(from, step) }] };
  }, [isOpen, isReduced]);
  return { progress, style };
};

type SurfaceProps = Pick<
  DialogProps,
  "children" | "closeLabel" | "footer" | "formLabel" | "header" | "name" | "subtitle" | "title"
> & {
  readonly close: () => void;
  readonly titleId: string;
  readonly width: DialogWidth;
};

/** The plate: `radius.xl`, `sheet.pad`, the overlay shadow in light, the inner hairline in dark. */
const DialogSurface = ({
  children,
  close,
  closeLabel,
  footer,
  formLabel,
  header,
  name,
  subtitle,
  title,
  titleId,
  width,
}: SurfaceProps) => {
  const { scheme } = useTheme();
  const surfaceRef = useSheetFocusRef({ closeLabel });
  return (
    <View
      ref={surfaceRef}
      {...(formLabel !== undefined && { accessibilityLabel: formLabel, role: "form" })}
      {...({ dataSet: { paceSheet: name, paceSurface: "sheet" } } as object)}
      className={cx(
        "max-h-full shrink self-center rounded-xl bg-elevated p-sheet-pad lg:p-sheet-pad-lg",
        width === "form" ? "w-dialog max-w-full" : "w-inspector max-w-full",
      )}
      style={{ boxShadow: shadow(scheme, "overlay") }}
    >
      <OverlayContent
        closeLabel={closeLabel}
        footer={footer}
        hasCross
        header={header}
        onClose={close}
        subtitle={subtitle}
        title={title}
        titleId={titleId}
      >
        {children}
      </OverlayContent>
    </View>
  );
};

/**
A form, a choice or a confirmation in the middle of a wide window (spec §4.2.21, the owner's "on
PC a plate in the centre"): `radius.xl`, `sheet.pad`, at most 85 % of the window's height, a form's
width (560) or a confirmation's (400). A close cross sits top-trailing; Escape and a click on the
dim close it too. It scales in from 96 % and out to 98 % with a fade, never from nothing (F-MOT-06),
and stays mounted through its exit (F-MOT-05). The modal is the dialog (react-native-web gives it
`role="dialog"` and `aria-modal`, and traps focus in it), named by its title; the keyboard starts on
its first field or control, never the dim, and goes back to what opened it when it closes.
*/
export const Dialog = ({
  dismissible = true,
  onClose,
  open,
  width = "form",
  ...surface
}: DialogProps) => {
  const { scheme } = useTheme();
  const titleId = useId();
  const phase = useOverlayPhase(open);
  const motion = useDialogMotion(phase.isOpen, phase.letGo);
  // The web page dims its status bar (`theme-color`) with the dim.
  useScrim(phase.isOpen);
  const { close, dismiss } = overlayClosers({ dismissible, isOpen: phase.isOpen, onClose });
  return (
    <Modal
      animationType="none"
      aria-labelledby={titleId}
      onRequestClose={dismiss}
      testID="overlay-modal"
      transparent
      visible={phase.isMounted}
    >
      <OverlayLayer>
        {/* Outside the app's root (a portal on the web): the theme's variables again, or no ink. */}
        <View
          className="flex-1 items-center justify-center p-gutter"
          pointerEvents={phase.isOpen ? "auto" : "none"}
          style={paletteVars(scheme)}
        >
          <Scrim
            closeLabel={surface.closeLabel}
            hasCross
            onPress={dismiss}
            progress={motion.progress}
          />
          {/* The animated wrapper only moves; the look is on a plain view inside (class names on
          reanimated views are dropped on the web, which left the sheet see-through). */}
          <Animated.View
            style={[motion.style, { maxHeight: "85%", width: "100%" }]}
            testID="dialog-frame"
          >
            <DialogSurface {...surface} close={close} titleId={titleId} width={width} />
          </Animated.View>
        </View>
      </OverlayLayer>
    </Modal>
  );
};
