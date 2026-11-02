// The root workspace has no vitest; Bun's runner exposes the same describe/it/expect API.
import { describe, expect, it } from "bun:test";
import { createRequire } from "node:module";

type Processor = {
  process: (css: string, options: { from: undefined }) => Promise<{ css: string }>;
};

// Tailwind and PostCSS are the app's dependencies: resolve them (and the config) from the app.
const app = createRequire(new URL("../../apps/app/package.json", import.meta.url));
const tailwind = app("tailwindcss") as (config: object) => object;
const postcss = createRequire(app.resolve("tailwindcss"))("postcss") as (
  plugins: readonly object[],
) => Processor;
const config = app("./tailwind.config.js") as object;

/** The utilities the app's Tailwind config generates for `classes`, minified to one line. */
const compile = async (classes: string): Promise<string> => {
  const content = [{ extension: "html", raw: `<div class="${classes}"></div>` }];
  const result = await postcss([tailwind({ ...config, content })]).process("@tailwind utilities;", {
    from: undefined,
  });
  return result.css.replaceAll(/\s+/g, " ").replaceAll(/ ?([{};:]) ?/g, "$1");
};

describe("apps/app/tailwind.config.js", () => {
  it("gives a type role its phone size, then its desktop size from 1024 px", async () => {
    const css = await compile("text-body font-normal");
    const phone = css.indexOf(".text-body{font-size:16px;line-height:22px;font-weight:400}");
    const desktop = css.indexOf("@media (min-width:1024px){");
    expect(phone).toBeGreaterThanOrEqual(0);
    expect(desktop).toBeGreaterThan(phone);
    // Later in the sheet, so the desktop size wins over the phone one at the same specificity.
    expect(css.slice(desktop)).toContain(
      ".text-body{font-size:15px;letter-spacing:0px;line-height:21px}",
    );
    // An explicit weight comes before the media block and the media block sets none: it holds.
    expect(css.indexOf(".font-normal{font-weight:400}")).toBeLessThan(desktop);
    expect(css.slice(desktop)).not.toContain("font-weight");
  });

  it("generates nothing for a class off the token scales (the theme is replaced)", async () => {
    const css = await compile("p-1.5 h-11 text-sm leading-5 rounded-full bg-surface p-4");
    expect(css).toContain(".p-4{padding:16px}");
    for (const name of [
      String.raw`p-1\.5`,
      "h-11",
      "text-sm",
      "leading-5",
      "rounded-full",
      "bg-surface",
    ]) {
      expect(css, name).not.toContain(`.${name}{`);
    }
  });
});
