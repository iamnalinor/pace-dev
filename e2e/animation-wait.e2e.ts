import { waitForTransitions } from "./support/animation-wait.ts";
import { expect, test } from "./support/fixtures.ts";

test("transition waiting finishes while a decorative spinner keeps running", async ({ page }) => {
  test.setTimeout(5000);
  await page.setContent('<div id="spinner">Loading</div><div id="transition">Content</div>');
  await page.evaluate(() => {
    const spinner = globalThis.document.querySelector("#spinner");
    const transition = globalThis.document.querySelector("#transition");
    spinner?.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
      duration: 1000,
      iterations: Infinity,
    });
    transition?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: "forwards" });
  });
  await waitForTransitions(page);
  const states = await page.evaluate(() => ({
    spinner: globalThis.document.querySelector("#spinner")?.getAnimations()[0]?.playState,
    transition: globalThis.document.querySelector("#transition")?.getAnimations()[0]?.playState,
  }));
  expect(states).toEqual({ spinner: "running", transition: "finished" });
});

test("paused finite animations do not block measurements", async ({ page }) => {
  await page.setContent('<div id="paused">Content</div>');
  await page.evaluate(() => {
    globalThis.document
      .querySelector("#paused")
      ?.animate([{ opacity: 0 }, { opacity: 1 }], 60_000)
      .pause();
  });
  await waitForTransitions(page);
  await expect(page.getByText("Content")).toBeAttached();
});
