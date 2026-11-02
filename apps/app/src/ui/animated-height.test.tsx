import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { AnimatedHeight } from "./animated-height.tsx";

type Node = { readonly parent: Node | null; readonly props: { readonly style?: unknown } };

const layout = (height: number) => ({
  nativeEvent: { layout: { height, width: 300, x: 0, y: 0 } },
});

/** The view `AnimatedHeight` measures: the content's parent. */
const measuredView = (): Node => {
  const measured = (screen.getByText("Line") as unknown as Node).parent;
  if (measured === null) {
    throw new Error("the content has no measured parent");
  }
  return measured;
};

/** The height the animated box (the measured view's parent) is held at, if any. */
const boxHeight = (): unknown => {
  const style = measuredView().parent?.props.style;
  // An animated view's style is a list: the clip and the animated part.
  const styles = (Array.isArray(style) ? style : [style]) as (
    | null
    | undefined
    | { readonly height?: number }
  )[];
  return styles.find((style) => style?.height !== undefined)?.height;
};

describe("AnimatedHeight", () => {
  it("takes its first real height as it is, not one measured while hidden (a first-sync cover)", async () => {
    await render(
      <AnimatedHeight>
        <Text>Line</Text>
      </AnimatedHeight>,
    );
    // Under `display: none` the content lays out at 0 high: that is no height to hold the box
    // at (it would grow from nothing once shown, its content clipped meanwhile).
    await fireEvent(measuredView() as never, "layout", layout(0));
    expect(boxHeight()).toBeUndefined();
  });
});
