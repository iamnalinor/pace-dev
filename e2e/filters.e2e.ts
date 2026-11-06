import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { pushAsClient, ulid } from "./support/seed.ts";

const PROJECTS = 14;

/** An English account with many projects, each with one open task: the filter row cannot fit. */
const seed = async (token: string): Promise<void> => {
  const now = Date.now();
  const at = (offset: number): string => new Date(now - 90_000 + offset * 1000).toISOString();
  const bodies = [
    { payload: { language: "en", timezone: "Europe/Moscow" }, type: "settings.updated" },
    ...Array.from({ length: PROJECTS }, (_, index) => {
      const projectId = ulid(now - 100_000 + index);
      return [
        {
          payload: { color: "blue", name: `Project number ${String(index)}`, projectId },
          type: "project.created",
        },
        {
          payload: {
            fields: {},
            presetId: "personal",
            projectId,
            subtasks: [],
            taskId: ulid(now - 80_000 + index),
            title: `Task ${String(index)}`,
          },
          type: "task.created",
        },
      ];
    }).flat(),
  ];
  const events = bodies.map((body, index) => ({
    ...body,
    deviceId: "e2e-seed",
    id: ulid(now - 70_000 + index),
    occurredAt: at(index),
    precision: "exact",
    recordedAt: at(index),
    source: "web",
  }));
  expect((await pushAsClient(token, events)).ok).toBe(true);
};

/** Now's project filter (Task 4.3, F-DAT-02, F-DAT-05-006): a row that goes on says so and follows the wheel. */
test.describe("the project filter row", () => {
  test("shows a cue at the end that has more, and the mouse wheel scrolls it sideways", async ({
    page,
  }) => {
    const { token } = await loginViaApi(page);
    await seed(token);
    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto("/");
    const chips = page.getByRole("radiogroup", { name: "Filter by project" });
    await expect(chips).toBeVisible({ timeout: 30_000 });
    const scroller = page.getByTestId("chip-scroller");
    await expect(page.getByTestId("chip-scroller-cue-end")).toBeVisible();
    const box = await scroller.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move((box?.x ?? 0) + 100, (box?.y ?? 0) + 20);
    await page.mouse.wheel(0, 300);
    await expect(page.getByTestId("chip-scroller-cue-start")).toBeVisible();
    // The last chip is reachable by wheel alone.
    await page.mouse.wheel(0, 5000);
    await expect(
      chips.getByRole("radio", { name: `Project number ${String(PROJECTS - 1)}` }),
    ).toBeInViewport();
    await expect(page.getByTestId("chip-scroller-cue-end")).toBeHidden();
  });
});
