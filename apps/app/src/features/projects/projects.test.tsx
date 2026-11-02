import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { ProjectScreen } from "#app/screens/project-screen.tsx";
import { ProjectsScreen } from "#app/screens/projects-screen.tsx";
import { isControl } from "#app/test/focus-target.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { ALGEBRA_ID } from "@pace/core/testing";

/** Where focus was moved, as the form asked the platform (bug class 5). */
const mockMoveFocus = jest.fn<undefined, [unknown, string | undefined]>();
jest.mock("#app/platform/move-focus.ts", (): unknown => ({
  isFocusLost: () => true,
  moveFocus: (target: unknown, say?: string) => {
    mockMoveFocus(target, say);
  },
}));

describe("project forms", () => {
  it("creates a project, refusing a name already taken", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<ProjectsScreen />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: en("projects.new") }));
    await fireEvent.changeText(screen.getByLabelText(en("projects.name")), "algebra");
    await fireEvent.press(screen.getByRole("button", { name: en("projects.create") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      en("actionError.project/name-taken"),
    );
    await fireEvent.changeText(screen.getByLabelText(en("projects.name")), "Physics");
    await fireEvent.press(screen.getByRole("radio", { name: en("color.teal") }));
    await fireEvent.press(screen.getByRole("button", { name: en("projects.create") }));
    expect(await screen.findByRole("link", { name: "Physics" })).toBeOnTheScreen();
  });

  it("puts the cursor in a new project's name; Enter on it empty says what is missing (QA 17 L6)", async () => {
    await renderScreen(<ProjectsScreen />, await createTestRuntime());
    await fireEvent.press(screen.getByRole("button", { name: en("projects.new") }));
    const name = screen.getByLabelText(en("projects.name"));
    expect(name).toHaveProp("autoFocus", true);
    await fireEvent(name, "submitEditing");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      en("actionError.project/name-required"),
    );
  });

  it("gives focus back to New project when its form closes (QA round 18 L9)", async () => {
    await renderScreen(<ProjectsScreen />, await createTestRuntime());
    await fireEvent.press(screen.getByRole("button", { name: en("projects.new") }));
    mockMoveFocus.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: en("common.cancel") }));
    const [back] = mockMoveFocus.mock.calls[0] ?? [];
    const opener = screen.getByRole("button", { name: en("projects.new") });
    expect(isControl(back, opener)).toBe(true);
  });

  it("renames a project and archives it from its page", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<ProjectScreen id={ALGEBRA_ID} />, runtime);
    const project = () => runtime.state.store.getState().projects.byId[ALGEBRA_ID];
    await fireEvent.press(screen.getByRole("button", { name: en("project.edit") }));
    await fireEvent.changeText(screen.getByLabelText(en("project.description")), "Weekly sets");
    await fireEvent.press(screen.getByRole("button", { name: en("common.save") }));
    await waitFor(() => {
      expect(project()?.description).toBe("Weekly sets");
    });
    await fireEvent.press(screen.getByRole("button", { name: en("project.edit") }));
    await fireEvent.press(screen.getByRole("button", { name: en("project.archive") }));
    await waitFor(() => {
      expect(project()?.archived).toBe(true);
    });
  });
});
