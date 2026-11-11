import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { Collapse } from "./disclosure.tsx";

describe("Collapse (a fold another control drives; QA 21 L2)", () => {
  it("mounts nothing while closed, and its content once open", async () => {
    const view = await render(
      <Collapse open={false}>
        <Text>Reason</Text>
      </Collapse>,
    );
    expect(screen.queryByText("Reason")).toBeNull();
    await view.rerender(
      <Collapse open>
        <Text>Reason</Text>
      </Collapse>,
    );
    expect(screen.getByText("Reason")).toBeOnTheScreen();
  });

  it("lets go of the content once its closing animation has finished", async () => {
    const view = await render(
      <Collapse open>
        <Text>Reason</Text>
      </Collapse>,
    );
    await view.rerender(
      <Collapse open={false}>
        <Text>Reason</Text>
      </Collapse>,
    );
    expect(screen.queryByText("Reason")).toBeNull();
  });
});
