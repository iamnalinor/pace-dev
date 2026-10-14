import { screen } from "@testing-library/react-native";

/** An element of the rendered tree. */
type ReactTestInstance = NonNullable<typeof screen.root>;

/** The roles a person acts on: a control of one of these inside another is a nested control. */
const CONTROL_ROLES = new Set(["button", "checkbox", "link", "radio", "switch", "tab"]);

const roleOf = (instance: ReactTestInstance): unknown =>
  instance.props["accessibilityRole"] ?? instance.props["role"];

const isControl = (instance: ReactTestInstance): boolean =>
  typeof instance.type === "string" && CONTROL_ROLES.has(String(roleOf(instance)));

/** The nearest control above `instance`, or null. */
const enclosingControl = (instance: ReactTestInstance): null | ReactTestInstance => {
  const { parent } = instance;
  if (parent === null) {
    return null;
  }
  return isControl(parent) ? parent : enclosingControl(parent);
};

/** A control as a failure names it: its role and its label. */
const nameOf = (instance: ReactTestInstance): string =>
  `${String(roleOf(instance))} "${String(
    instance.props["accessibilityLabel"] ?? instance.props["aria-label"] ?? "?",
  )}"`;

/**
The controls on screen that sit inside another control (a link inside a row's button): a screen
reader never reaches them, the web build nests a focusable inside a focusable (axe's
`nested-interactive`), and on a phone the outer press may take the tap. Each is named
"inner in outer" by their roles and labels.
*/
export const controlsInsideControls = (): readonly string[] => {
  const { root } = screen;
  if (root === null) {
    throw new Error("nothing is rendered");
  }
  return root.queryAll(isControl).flatMap((control) => {
    const outer = enclosingControl(control);
    return outer === null ? [] : `${nameOf(control)} in ${nameOf(outer)}`;
  });
};
