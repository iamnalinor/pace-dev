import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export type Credentials = {
  readonly email: string;
  readonly name: string;
  readonly password: string;
};

/** A unique user per test: tests run in parallel against one shared database. */
export const newCredentials = (name: string): Credentials => ({
  email: `${name.toLowerCase()}-${crypto.randomUUID()}@mail.test`,
  name,
  password: "correct horse battery staple",
});

export const signUp = async (page: Page, user: Credentials): Promise<void> => {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
};

export const signIn = async (page: Page, user: Credentials): Promise<void> => {
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
};

/** Fails on any serious or critical WCAG 2.x A/AA violation on the current page. */
export const expectNoA11yViolations = async (page: Page): Promise<void> => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    serious.map(({ help, id, nodes }) => ({ help, id, targets: nodes.map((node) => node.target) })),
  ).toEqual([]);
};

export { expect, test } from "@playwright/test";
