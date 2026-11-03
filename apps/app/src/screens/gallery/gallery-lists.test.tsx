import { screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { galleryData } from "@pace/core/testing";

import { ListSections } from "./gallery-lists.tsx";

describe("the gallery's grouped list", () => {
  it("shows every worst-case project as a two-line row, the first one picked", async () => {
    const data = galleryData("worst", "en");
    await renderScreen(<ListSections data={data} />, await createTestRuntime({ world: "empty" }));
    for (const project of data.projects) {
      expect(screen.getByText(project.name).props["numberOfLines"]).toBe(2);
    }
    expect(screen.getAllByTestId("list-row-selected-bar")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: en("dev.gallery.lists.navigation") }),
    ).toBeOnTheScreen();
  });

  it("leaves the projects group out when the set has none", async () => {
    const data = galleryData("empty", "en");
    await renderScreen(<ListSections data={data} />, await createTestRuntime({ world: "empty" }));
    expect(screen.queryByTestId("list-row-selected-bar")).toBeNull();
    expect(screen.getByRole("header", { name: en("dev.gallery.section.lists") })).toBeOnTheScreen();
  });
});
