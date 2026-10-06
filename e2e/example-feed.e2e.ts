import {
  expect,
  expectNoA11yViolations,
  newCredentials,
  signUp,
  test,
} from "./support/fixtures.ts";

test("post, like, and see it from another account", async ({ browser, page }) => {
  const alice = newCredentials("Alice");
  const text = `Hello from e2e ${crypto.randomUUID()}`;
  await signUp(page, alice);

  await page.getByRole("textbox", { name: "What's happening?" }).fill(text);
  await page.getByRole("button", { name: "Post" }).click();
  const alicePost = page.getByRole("article").filter({ hasText: text });
  await expect(alicePost).toBeVisible();
  await expect(page.getByRole("textbox", { name: "What's happening?" })).toHaveValue("");

  await alicePost.getByRole("button", { name: "Like" }).click();
  await expect(alicePost.getByRole("button", { name: "Unlike" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(alicePost.getByTestId("like-count")).toHaveText("1");

  // Bob, in a separate browser context (separate cookies), sees Alice's like.
  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  await signUp(bobPage, newCredentials("Bob"));
  const bobView = bobPage.getByRole("article").filter({ hasText: text });
  await expect(bobView.getByTestId("like-count")).toHaveText("1");
  await expect(bobView.getByRole("button", { name: "Like" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  // Only the author can delete.
  await expect(bobView.getByRole("button", { name: "Delete post" })).toHaveCount(0);
  await bobContext.close();
});

test("the author deletes a post after confirming", async ({ page }) => {
  const text = `To be deleted ${crypto.randomUUID()}`;
  await signUp(page, newCredentials("Deleter"));
  await page.getByRole("textbox", { name: "What's happening?" }).fill(text);
  await page.getByRole("button", { name: "Post" }).click();
  const post = page.getByRole("article").filter({ hasText: text });
  await expect(post).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await post.getByRole("button", { name: "Delete post" }).click();

  await expect(post).toHaveCount(0);
});

test("the feed is accessible", async ({ page }) => {
  await signUp(page, newCredentials("A11y"));
  await page.getByRole("textbox", { name: "What's happening?" }).fill("Accessible post");
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByRole("article").first()).toBeVisible();

  await expectNoA11yViolations(page);
});
