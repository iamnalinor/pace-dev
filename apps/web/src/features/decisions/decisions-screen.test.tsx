import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { artboardServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";

import { DecisionsScreen } from "./decisions-screen.tsx";

const decision = {
  at: "2026-10-06T11:00:00.000Z",
  explanation: "A digest window.",
  id: "d1",
  inputs: {},
  kind: "notification",
  outcome: "sent",
  rule: "digest",
  taskId: null,
};

describe("DecisionsScreen", () => {
  it("lists decisions and searches them on the server", async () => {
    const queries: (null | string)[] = [];
    const { services } = await artboardServices({
      routes: {
        "GET /api/decisions": ({ url }) => {
          queries.push(url.searchParams.get("q"));
          return { decisions: url.searchParams.get("q") === "nothing" ? [] : [decision] };
        },
      },
    });
    const { user } = renderWithProviders(<DecisionsScreen />, { services });
    expect(await screen.findByText("A digest window.")).toBeInTheDocument();
    expect(screen.getByText("sent")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search decisions" }), "nothing");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("No decisions yet.")).toBeInTheDocument();
    expect(queries).toEqual([null, "nothing"]);
  });

  it("says so when the log cannot be loaded", async () => {
    const { services } = await artboardServices();
    renderWithProviders(<DecisionsScreen />, { services });
    expect(await screen.findByText("The decision log could not be loaded.")).toBeInTheDocument();
  });
});
