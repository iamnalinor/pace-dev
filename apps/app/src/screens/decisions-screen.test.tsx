import { fireEvent, screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { DecisionsScreen } from "./decisions-screen.tsx";

const decision = {
  at: "2026-10-06T11:00:00.000Z",
  explanation: "A digest window.",
  id: "d1",
  inputs: {},
  kind: "notification",
  outcome: "suppressed",
  rule: "digest",
  taskId: null,
};

describe("DecisionsScreen", () => {
  it("lists the decision log and searches it", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "GET /api/decisions": ({ url }) => ({
          decisions: url.searchParams.get("q") === "nothing" ? [] : [decision],
        }),
      },
    });
    await renderScreen(<DecisionsScreen />, runtime);
    expect(await screen.findByText("A digest window.")).toBeOnTheScreen();
    expect(screen.getByText(/held back/u)).toBeOnTheScreen();
    const search = screen.getByLabelText(en("decisions.search"));
    await fireEvent.changeText(search, "nothing");
    await fireEvent(search, "submitEditing");
    expect(await screen.findByText(en("decisions.empty"))).toBeOnTheScreen();
  });
});
