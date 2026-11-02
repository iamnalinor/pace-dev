import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { useIsScrimUp, useScrim } from "./scrim.ts";

const Watcher = () => <Text testID="state">{String(useIsScrimUp())}</Text>;
const Sheetlike = ({ visible }: { readonly visible: boolean }) => {
  useScrim(visible);
  return null;
};

describe("the scrim signal", () => {
  it("is up while a visible sheet is mounted and down after it hides or unmounts", async () => {
    const view = await render(
      <>
        <Watcher />
        <Sheetlike visible={false} />
      </>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("false");
    await view.rerender(
      <>
        <Watcher />
        <Sheetlike visible />
      </>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("true");
    await view.rerender(
      <>
        <Watcher />
        <Sheetlike visible={false} />
      </>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("false");
    await view.rerender(
      <>
        <Watcher />
        <Sheetlike visible />
      </>,
    );
    await view.rerender(<Watcher />);
    expect(screen.getByTestId("state")).toHaveTextContent("false");
  });

  it("stays up until the last of two stacked sheets is gone", async () => {
    const view = await render(
      <>
        <Watcher />
        <Sheetlike visible />
        <Sheetlike visible />
      </>,
    );
    await view.rerender(
      <>
        <Watcher />
        <Sheetlike visible />
        <Sheetlike visible={false} />
      </>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("true");
    await act(async () => {
      await view.rerender(<Watcher />);
    });
    expect(screen.getByTestId("state")).toHaveTextContent("false");
  });
});
