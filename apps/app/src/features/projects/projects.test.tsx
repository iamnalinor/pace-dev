import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { ProjectScreen } from "#app/features/projects/project-screen.tsx";
import { ProjectsScreen } from "#app/features/projects/projects-screen.tsx";
import { isControl } from "#app/test/focus-target.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
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
    expect(await screen.findByRole("link", { name: "Physics, No open tasks" })).toBeOnTheScreen();
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

  /** Each way the form closes: what is typed first, and the button that closes it. */
  const closings: readonly (readonly [string, () => Promise<void>, () => string])[] = [
    ["Cancel", () => Promise.resolve(), () => en("common.cancel")],
    [
      "Create",
      async (): Promise<void> => {
        await fireEvent.changeText(screen.getByLabelText(en("projects.name")), "Physics");
      },
      () => en("projects.create"),
    ],
  ];
  it.each(closings)(
    "gives focus back to New project when its form closes by %s (QA round 18 L9, fix round 5 V7)",
    async (_way, fill, button) => {
      await renderScreen(<ProjectsScreen />, await createTestRuntime());
      await fireEvent.press(screen.getByRole("button", { name: en("projects.new") }));
      await fill();
      mockMoveFocus.mockClear();
      await fireEvent.press(screen.getByRole("button", { name: button() }));
      const opener = await screen.findByRole("button", { name: en("projects.new") });
      await waitFor(() => {
        expect(mockMoveFocus).toHaveBeenCalled();
      });
      const [back] = mockMoveFocus.mock.calls[0] ?? [];
      expect(isControl(back, opener)).toBe(true);
    },
  );

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

  it("says a project went to the archive, with Undo, and goes back to the list (R27-03)", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<ProjectScreen id={ALGEBRA_ID} />, runtime);
    const project = () => runtime.state.store.getState().projects.byId[ALGEBRA_ID];
    const name = project()?.name ?? "";
    await fireEvent.press(screen.getByRole("button", { name: en("project.edit") }));
    await fireEvent.press(screen.getByRole("button", { name: en("project.archive") }));
    expect(await screen.findByText(en("project.archived", { name }))).toBeOnTheScreen();
    expect(router.back).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: en("common.undo") }));
    await waitFor(() => {
      expect(project()?.archived).toBe(false);
    });
  });

  it("takes the archive toast away once the project is restored from its page (QA round 28 R28-02)", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<ProjectScreen id={ALGEBRA_ID} />, runtime);
    const name = runtime.state.store.getState().projects.byId[ALGEBRA_ID]?.name ?? "";
    await fireEvent.press(screen.getByRole("button", { name: en("project.edit") }));
    await fireEvent.press(screen.getByRole("button", { name: en("project.archive") }));
    expect(await screen.findByText(en("project.archived", { name }))).toBeOnTheScreen();
    const before = runtime.state.store.getState().log.length;
    // Restored from its page («Вернуть из архива»): a project.updated, no revocation.
    await fireEvent.press(screen.getByRole("button", { name: en("project.restore") }));
    await waitFor(() => {
      expect(screen.queryByText(en("project.archived", { name }))).toBeNull();
    });
    expect(runtime.state.store.getState().log).toHaveLength(before + 1);
    expect(runtime.state.store.getState().log.at(-1)?.type).toBe("project.updated");
  });

  it("offers the archive only when something is archived, and says «no projects» only when none is shown (QA 27 review M5)", async () => {
    const runtime = await createTestRuntime();
    const list = await renderScreen(<ProjectsScreen />, runtime);
    expect(screen.queryByRole("switch", { name: en("projects.showArchived") })).toBeNull();
    await list.unmount();
    for (const project of Object.values(runtime.state.store.getState().projects.byId)) {
      await runtime.actions.updateProject(project.id, { archived: true });
    }
    await renderScreen(<ProjectsScreen />, runtime);
    expect(screen.getByText(en("projects.empty"))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("switch", { name: en("projects.showArchived") }));
    expect(screen.queryByText(en("projects.empty"))).toBeNull();
  });

  it("lists archived projects once asked, and an archived one says so with Restore at hand (R27-03)", async () => {
    const runtime = await createTestRuntime();
    const name = runtime.state.store.getState().projects.byId[ALGEBRA_ID]?.name ?? "";
    await runtime.actions.updateProject(ALGEBRA_ID, { archived: true });
    const list = await renderScreen(<ProjectsScreen />, runtime);
    expect(screen.queryByText(name)).toBeNull();
    await fireEvent.press(screen.getByRole("switch", { name: en("projects.showArchived") }));
    expect(
      screen.getByRole("link", { name: `${name}, ${en("project.archivedBadge")}` }),
    ).toBeOnTheScreen();
    await list.unmount();
    await renderScreen(<ProjectScreen id={ALGEBRA_ID} />, runtime);
    expect(screen.getByText(en("project.archivedMark"))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("project.restore") }));
    await waitFor(() => {
      expect(runtime.state.store.getState().projects.byId[ALGEBRA_ID]?.archived).toBe(false);
    });
  });
});
