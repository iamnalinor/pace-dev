import type { Page } from "@playwright/test";

/** Wait for finite transitions; intentional repeating indicators never become idle. */
export const waitForTransitions = async (page: Page): Promise<void> => {
  await page.waitForFunction(() =>
    globalThis.document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  );
};
