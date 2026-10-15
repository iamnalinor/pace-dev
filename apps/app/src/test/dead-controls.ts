import { act, fireEvent, screen } from "@testing-library/react-native";

import { redirected, router } from "./router.ts";

type Instance = NonNullable<typeof screen.root>;

/** What a person presses: the roles a control has on a phone. */
const CONTROL_ROLES: ReadonlySet<string> = new Set([
  "button",
  "checkbox",
  "link",
  "radio",
  "switch",
  "tab",
]);

const roleOf = (instance: Instance): string =>
  String(instance.props["accessibilityRole"] ?? instance.props["role"] ?? "");

type A11yState = { readonly disabled?: boolean; readonly checked?: "mixed" | boolean };

const stateProp = (instance: Instance): A11yState | undefined =>
  instance.props["accessibilityState"] as A11yState | undefined;

/**
Not to be pressed: disabled, or a choice already chosen (a checked radio: pressing it again is
meant to change nothing).
*/
const isInert = (instance: Instance): boolean => {
  const state = stateProp(instance);
  return (
    state?.disabled === true ||
    instance.props["aria-disabled"] === true ||
    instance.props["disabled"] === true ||
    (roleOf(instance) === "radio" &&
      (state?.checked === true || instance.props["aria-checked"] === true))
  );
};

/** The words a control shows, for one without a label. */
const textOf = (instance: Instance | string): string =>
  typeof instance === "string"
    ? instance
    : instance.children.map((child) => textOf(child)).join("");

/** The enabled controls on screen, in the order of the tree (the same on every fresh render). */
const enabledControls = (): readonly Instance[] =>
  screen.root === null
    ? []
    : screen.root.queryAll(
        (instance) =>
          typeof instance.type === "string" &&
          CONTROL_ROLES.has(roleOf(instance)) &&
          !isInert(instance),
      );

/** A control as a failure names it: its role and its label. */
const nameOf = (instance: Instance): string => {
  const label: unknown = instance.props["accessibilityLabel"] ?? instance.props["aria-label"];
  return typeof label === "string"
    ? `${roleOf(instance)} "${label}"`
    : `${roleOf(instance)} without a label, showing "${textOf(instance).slice(0, 40)}"`;
};

/** What a press may change: the screen, a navigation, a redirect, or what `extra` reads. */
const stateOf = (extra: () => unknown): string =>
  JSON.stringify([
    screen.toJSON(),
    Object.values(router).map((call) => call.mock.calls.length),
    redirected.mock.calls.length,
    extra(),
  ]);

/** Lets the press's async work (a fake API call, a write) land. */
const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
  });
};

/** Presses it; a native switch (React Native's `Switch`) is flipped instead. */
const press = async (control: Instance): Promise<void> => {
  const state = stateProp(control);
  await (control.type.includes("Switch")
    ? fireEvent(control, "valueChange", (control.props["value"] ?? state?.checked) !== true)
    : fireEvent.press(control));
};

/** The `occurrence`-th enabled control named `name` (names repeat: one Undo per row). */
const findAgain = (name: string, occurrence: number): Instance | undefined =>
  enabledControls().filter((control) => nameOf(control) === name)[occurrence];

/**
Bug class 10 (a control that does nothing on one platform): renders the screen afresh for each
enabled control, presses it and reports the ones after which nothing changed: no navigation or
redirect, nothing new on screen (a sheet, a toast, a state shown), and nothing `extra` reads (the
store). `allow` names controls whose press is meant to look the same (each with its reason, at
the call). jest renders the native build: this is the phone's layout.
*/
export const deadControls = async (
  render: () => Promise<{ readonly extra: () => unknown }>,
  allow: readonly string[] = [],
): Promise<readonly string[]> => {
  await render();
  await settle();
  const names = enabledControls().map((control) => nameOf(control));
  const dead: string[] = [];
  for (const [index, name] of names.entries()) {
    await screen.unmount();
    jest.clearAllMocks();
    const { extra } = await render();
    await settle();
    const occurrence = names.slice(0, index).filter((earlier) => earlier === name).length;
    const control = findAgain(name, occurrence);
    if (control === undefined) {
      dead.push(`${name}: not found again on a fresh render`);
      continue;
    }
    const before = stateOf(extra);
    await press(control);
    await settle();
    if (stateOf(extra) === before && !allow.includes(name)) {
      dead.push(name);
    }
  }
  return dead;
};
