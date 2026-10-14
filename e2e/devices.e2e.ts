import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { API_URL, loginViaApi } from "./support/login.ts";
import { seedLivedIn } from "./support/seed.ts";

/** Screenshots for review land here when set (the run's output folder otherwise). */
const SHOT_DIR = process.env["E2E_SHOT_DIR"];

test.use({ viewport: { height: 900, width: 1440 } });

test("adds a computer, which then reports its apps and shows on Calendar", async ({
  page,
}, info) => {
  const { token } = await loginViaApi(page);
  // A lived-in account (in Russian) so Calendar has something to show.
  await seedLivedIn(token);
  await page.goto("/devices");
  await expect(page.getByText("Пока ничего не присылает данные.")).toBeVisible();
  await page.getByRole("button", { name: "Добавить компьютер" }).click();
  await page.getByRole("textbox", { name: "Название" }).fill("Linux Mint");
  await page.getByRole("button", { name: "Создать токен" }).click();
  // Picked explicitly: what comes preselected depends on the browser's platform.
  await page.getByRole("radio", { name: "Linux" }).click();
  await expect(page.getByRole("radio", { name: "Linux" })).toBeChecked();
  const command = page.getByText(/^curl .*pace_agent\.py install /u);
  await expect(command).toBeVisible();
  await expectNoA11yViolations(page);
  const text = (await command.textContent()) ?? "";
  const [, deviceToken = ""] = /--token '([^']+)'/u.exec(text) ?? [];
  // The server files the sessions under the token's computer, whatever id the agent sends.
  const deviceId = "agent-generated-id";

  // What the agent would send, with the token from the command.
  const now = Date.now();
  const sent = await fetch(`${API_URL}/api/usage/sessions`, {
    body: JSON.stringify({
      deviceId,
      deviceName: "Linux Mint",
      sessions: [
        {
          app: "code",
          endAt: new Date(now - 10 * 60_000).toISOString(),
          startAt: new Date(now - 70 * 60_000).toISOString(),
        },
      ],
    }),
    headers: { Authorization: `Bearer ${deviceToken}`, "Content-Type": "application/json" },
    method: "POST",
  });
  expect(sent.status).toBe(200);
  await page.getByRole("button", { name: "Готово" }).click();
  await page.reload();
  const row = page.getByRole("group", { name: "Linux Mint" });
  await expect(row.getByText(/^Компьютер · Данные 10/u)).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: SHOT_DIR === undefined ? info.outputPath("devices.png") : `${SHOT_DIR}/devices.png`,
  });

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { level: 1, name: "Календарь" })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.screenshot({
    fullPage: true,
    path: SHOT_DIR === undefined ? info.outputPath("calendar.png") : `${SHOT_DIR}/calendar.png`,
  });
});
