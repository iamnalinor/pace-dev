import type { screen } from "@testing-library/react-native";

type Rendered = NonNullable<typeof screen.root>;

/**
Whether a focus target (the pressable's native view, as a ref hands it to `moveFocus`) is the
control `element` renders: the two share the press handler.
*/
export const isControl = (target: unknown, element: Rendered | undefined): boolean => {
  const props = (target as null | { readonly props?: Readonly<Record<string, unknown>> })?.props;
  return (
    element !== undefined &&
    props?.["onResponderRelease"] !== undefined &&
    props["onResponderRelease"] === element.props["onResponderRelease"]
  );
};
