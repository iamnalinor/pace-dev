import { addTask } from "./support/composer.ts";
import { expect, test } from "./support/fixtures.ts";
import { createDevSession, freshTelegramId, resetAccount } from "./support/login.ts";

/** Same key as apps/app/src/platform/secure-session.ts. */
const SESSION_KEY = "pace.session";

test("a task added on one device shows on another in seconds, not on the next poll", async ({
  browser,
}) => {
  const telegramId = freshTelegramId();
  await resetAccount(telegramId);
  const signIn = async () => {
    const { token } = await createDevSession(telegramId);
    const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
    await context.addInitScript(
      ({ key, value }) => {
        localStorage.setItem(key, value);
      },
      { key: SESSION_KEY, value: token },
    );
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("textbox", { name: "New task" })).toBeVisible();
    return page;
  };
  const laptop = await signIn();
  const phone = await signIn();
  // Both listening: the second device's socket is open before the first one writes.
  await phone.waitForTimeout(1500);
  const title = `buy stamps ${crypto.randomUUID().slice(0, 6)}`;
  await addTask(laptop, title);
  // The poll is every 30 s (5 min with the live channel up): seconds mean the push came live.
  await expect(phone.getByRole("list", { name: "Tasks" }).getByText(title)).toBeVisible({
    timeout: 8000,
  });
  await laptop.context().close();
  await phone.context().close();
});
