import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useRef, useState } from "react";
import { Text, View } from "react-native";

import { withWindowWidth } from "#app/test/window.ts";

import { Popover } from "./popover.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

/** A picker's button with its popover, open; the anchor reports where it is. */
const modal = () => screen.getByTestId("overlay-modal", { includeHiddenElements: true });

const Picker = ({
  onClose,
  role,
}: {
  readonly onClose: () => void;
  readonly role?: "dialog" | "menu";
}) => {
  const anchorRef = useRef<View>(null);
  const [isOpen, setIsOpen] = useState(true);
  return (
    <ThemeProvider forced="light">
      <View ref={anchorRef} testID="anchor" />
      <Popover
        anchor={anchorRef}
        label="Project"
        onClose={() => {
          onClose();
          setIsOpen(false);
        }}
        open={isOpen}
        role={role}
      >
        <Text>Algebra</Text>
      </Popover>
    </ThemeProvider>
  );
};

describe("Popover (spec §4.2.21, §6 popover)", () => {
  withWindowWidth(1440);

  beforeEach(() => {
    jest.spyOn(View.prototype, "measureInWindow").mockImplementation((report) => {
      report(600, 100, 120, 44);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("is named by its label (the modal is the dialog), placed under its anchor", async () => {
    await render(<Picker onClose={jest.fn()} />);
    expect(modal().props["aria-label"]).toBe("Project");
    const style = JSON.stringify(screen.getByTestId("popover-frame").props["style"]);
    expect(style).toContain('"left":600');
    expect(style).toContain('"top":152');
    // Never from nothing: it grows from 98 %.
    expect(style).toContain('"scale":0.98');
  });

  it("says menu on its surface when it is one", async () => {
    await render(<Picker onClose={jest.fn()} role="menu" />);
    const surface = screen.getByTestId("popover-surface");
    expect(surface.props).toMatchObject({ accessibilityLabel: "Project", role: "menu" });
  });

  it("closes once on a click outside", async () => {
    const onClose = jest.fn();
    await render(<Picker onClose={onClose} />);
    const outside = screen.getByTestId("popover-outside", { includeHiddenElements: true });
    await fireEvent.press(outside);
    await fireEvent.press(outside);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes once on Escape", async () => {
    const onClose = jest.fn();
    await render(<Picker onClose={onClose} />);
    await act(() => {
      (modal().props as { onRequestClose: () => void }).onRequestClose();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("forgets where its anchor was once closed: reopened, it waits for a fresh measure", async () => {
    const Controlled = ({ open }: { readonly open: boolean }) => {
      const anchorRef = useRef<View>(null);
      return (
        <ThemeProvider forced="light">
          <View ref={anchorRef} testID="anchor" />
          <Popover anchor={anchorRef} label="Project" onClose={jest.fn()} open={open}>
            <Text>Algebra</Text>
          </Popover>
        </ThemeProvider>
      );
    };
    const view = await render(<Controlled open />);
    expect(JSON.stringify(screen.getByTestId("popover-frame").props["style"])).toContain(
      '"left":600',
    );
    await view.rerender(<Controlled open={false} />);
    // The anchor moved while it was closed, and has not answered yet.
    const pending: ((...box: [number, number, number, number]) => void)[] = [];
    jest.spyOn(View.prototype, "measureInWindow").mockImplementation((report) => {
      pending.push(report);
    });
    await view.rerender(<Controlled open />);
    const frame = JSON.stringify(
      screen.getByTestId("popover-frame", { includeHiddenElements: true }).props["style"],
    );
    expect(frame).not.toContain('"left":600');
    expect(frame).toContain('"opacity":0');
    await act(() => {
      pending.at(-1)?.(200, 300, 120, 44);
    });
    expect(JSON.stringify(screen.getByTestId("popover-frame").props["style"])).toContain(
      '"left":200',
    );
  });
});
