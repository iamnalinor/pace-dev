import { screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { galleryData } from "@pace/core/testing";

import { KitSections } from "./gallery-kit.tsx";

/**
The kit's part of the worst-case gallery (redesign plan, batch 3: each kit task adds its demo and
worst variants). The overflow itself is measured in a browser by `e2e/worst-case.e2e.ts`.
*/
describe("the gallery's kit sections", () => {
  it("cuts each worst-case project name to one line beside its badge, and links the worst address", async () => {
    const data = galleryData("worst", "en");
    await renderScreen(<KitSections data={data} />, await createTestRuntime({ world: "empty" }));
    for (const project of data.projects) {
      expect(screen.getByText(project.name).props["numberOfLines"]).toBe(1);
    }
    expect(screen.getByRole("header", { name: en("dev.gallery.section.icons") })).toBeOnTheScreen();
    expect(screen.getAllByRole("link")).toHaveLength(data.link === null ? 1 : 2);
  });

  it("shows nothing it has no data for: no project row, no capture, no outside link", async () => {
    const worst = galleryData("worst", "en");
    const empty = galleryData("empty", "en");
    expect(empty.projects).toEqual([]);
    expect(empty.inboxTexts).toEqual([]);
    expect(empty.link).toBeNull();
    await renderScreen(<KitSections data={empty} />, await createTestRuntime({ world: "empty" }));
    for (const project of worst.projects) {
      expect(screen.queryByText(project.name)).toBeNull();
    }
    expect(screen.queryByText(worst.inboxTexts[0] ?? "")).toBeNull();
    // The one link left is the internal one, to Now.
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: en("dev.gallery.link.inside") })).toBeOnTheScreen();
  });
});
