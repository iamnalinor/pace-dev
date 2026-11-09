/**
@jest-environment jsdom
*/
import { renderHook } from "@testing-library/react-native";

import type * as EscapeFirst from "./escape-first.ts";
import type * as UseHotkey from "./use-hotkey.web.tsx";

import { HOTKEYS } from "./hotkeys.ts";

type Modules = {
  readonly escape: typeof EscapeFirst;
  readonly hotkey: typeof UseHotkey;
};

/**
Loaded once the keyboard is set up (the registry reads it when it loads). One page, one copy:
the shortcut registry listens first, as in the app (a shortcut mounts before any tooltip shows).
*/
const modules: { current?: Modules } = {};

const loaded = (): Modules => {
  if (modules.current === undefined) {
    throw new Error("the modules did not load");
  }
  return modules.current;
};

const press = (type: "keydown" | "keyup"): void => {
  document.body.dispatchEvent(
    new KeyboardEvent(type, { bubbles: true, cancelable: true, key: "Escape" }),
  );
};

const pressEscape = (): void => {
  press("keydown");
  press("keyup");
};

/** What react-native-web's Modal does: it closes on a document keyup Escape. */
const listenLikeModal = (onClose: () => void): (() => void) => {
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      onClose();
    }
  };
  document.addEventListener("keyup", onKeyUp);
  return () => {
    document.removeEventListener("keyup", onKeyUp);
  };
};

const cleanups: (() => void)[] = [];

beforeAll(() => {
  // A computer's keyboard: the shortcut registry is on.
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    value: () => ({ matches: true }),
  });
  modules.current = {
    escape: jest.requireActual<Modules["escape"]>("./escape-first.ts"),
    hotkey: jest.requireActual<Modules["hotkey"]>("./use-hotkey.web.tsx"),
  };
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

describe("Escape at a shown tooltip on the web (review of 293b78c..9039ae6, I1)", () => {
  it("takes only the tooltip away: no Escape shortcut fires and no Modal closes", async () => {
    const { escape, hotkey } = loaded();
    const onPaneEscape = jest.fn();
    await renderHook(() => {
      hotkey.useHotkey(HOTKEYS.escape, onPaneEscape);
    });
    const onModalClose = jest.fn();
    cleanups.push(listenLikeModal(onModalClose));
    const onTooltipEscape = jest.fn();
    const release = escape.pushEscapeTaker(onTooltipEscape);
    pressEscape();
    expect(onTooltipEscape).toHaveBeenCalledTimes(1);
    expect(onPaneEscape).not.toHaveBeenCalled();
    expect(onModalClose).not.toHaveBeenCalled();
    // The tooltip is gone: the next Escape is the pane's and the sheet's.
    release();
    pressEscape();
    expect(onTooltipEscape).toHaveBeenCalledTimes(1);
    expect(onPaneEscape).toHaveBeenCalledTimes(1);
    expect(onModalClose).toHaveBeenCalledTimes(1);
  });

  it("takes it on its own listener too, where no shortcut is mounted", () => {
    const { escape } = loaded();
    const onModalClose = jest.fn();
    cleanups.push(listenLikeModal(onModalClose));
    const onTooltipEscape = jest.fn();
    cleanups.push(escape.pushEscapeTaker(onTooltipEscape));
    pressEscape();
    expect(onTooltipEscape).toHaveBeenCalledTimes(1);
    expect(onModalClose).not.toHaveBeenCalled();
  });

  it("swallows only the keyup of the Escape it took", () => {
    const { escape } = loaded();
    const onModalClose = jest.fn();
    cleanups.push(listenLikeModal(onModalClose));
    const release = escape.pushEscapeTaker(jest.fn());
    // The keydown is taken, but its keyup never comes (the window lost focus).
    press("keydown");
    release();
    pressEscape();
    expect(onModalClose).toHaveBeenCalledTimes(1);
  });

  it("a field that handles Escape itself keeps its sheet: the keyup is swallowed (a subtask being typed)", () => {
    const { escape } = loaded();
    escape.listenForEscape();
    const onModalClose = jest.fn();
    cleanups.push(listenLikeModal(onModalClose));
    const field = document.createElement("input");
    field.dataset["paceKeys"] = "escape";
    document.body.append(field);
    cleanups.push(() => {
      field.remove();
    });
    const onFieldEscape = jest.fn();
    field.addEventListener("keydown", onFieldEscape);
    for (const type of ["keydown", "keyup"] as const) {
      field.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key: "Escape" }));
    }
    // The field heard its Escape; the sheet around it did not.
    expect(onFieldEscape).toHaveBeenCalledTimes(1);
    expect(onModalClose).not.toHaveBeenCalled();
    // Elsewhere, Escape is the sheet's again.
    pressEscape();
    expect(onModalClose).toHaveBeenCalledTimes(1);
  });

  it("leaves a chord with Escape alone", () => {
    const { escape } = loaded();
    const onTooltipEscape = jest.fn();
    cleanups.push(escape.pushEscapeTaker(onTooltipEscape));
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Escape", shiftKey: true }),
    );
    expect(onTooltipEscape).not.toHaveBeenCalled();
  });
});
