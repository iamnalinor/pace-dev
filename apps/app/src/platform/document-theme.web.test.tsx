import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { documentGround } from "@pace/core";

import { DocumentTheme } from "./document-theme.web.tsx";

type Meta = { content: string };

/** A stand-in for the browser's document: the root's dataset and the `theme-color` metas. */
const fakeDocument = (metaCount: number) => {
  const metas: Meta[] = Array.from({ length: metaCount }, () => ({ content: "" }));
  const asElement = (meta: Meta) => ({
    setAttribute: (name: string, value: string) => {
      if (name === "content") {
        Object.assign(meta, { content: value });
      }
    },
  });
  const document = {
    createElement: () => {
      const meta: Meta = { content: "" };
      metas.push(meta);
      return { ...asElement(meta), name: "" };
    },
    documentElement: { dataset: {} as Record<string, string> },
    head: { append: () => undefined },
    querySelectorAll: () => metas.map((meta) => asElement(meta)),
  };
  return { document, metas };
};

describe("DocumentTheme", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  afterEach(() => {
    if (original === undefined) {
      Reflect.deleteProperty(globalThis, "document");
    } else {
      Object.defineProperty(globalThis, "document", original);
    }
  });

  const mount = async (metaCount: number, scheme: "dark" | "light", isDimmed: boolean) => {
    const fake = fakeDocument(metaCount);
    Object.defineProperty(globalThis, "document", { configurable: true, value: fake.document });
    const view = await renderScreen(
      <DocumentTheme isDimmed={isDimmed} scheme={scheme} />,
      await createTestRuntime(),
    );
    return { ...fake, view };
  };

  it("sets the page's theme and paints both theme-color metas with the app ground", async () => {
    const { document, metas } = await mount(2, "light", false);
    expect(document.documentElement.dataset["theme"]).toBe("light");
    expect(metas.map((meta) => meta.content)).toEqual([
      documentGround("light", false),
      documentGround("light", false),
    ]);
  });

  it("dims the metas under the scrim and follows a theme change", async () => {
    const { document, metas, view } = await mount(2, "dark", true);
    expect(metas.map((meta) => meta.content)).toEqual([
      documentGround("dark", true),
      documentGround("dark", true),
    ]);
    await view.rerender(<DocumentTheme isDimmed={false} scheme="light" />);
    expect(document.documentElement.dataset["theme"]).toBe("light");
    expect(metas.map((meta) => meta.content)).toEqual([
      documentGround("light", false),
      documentGround("light", false),
    ]);
  });

  it("adds a theme-color meta when the page has none", async () => {
    const { metas } = await mount(0, "dark", false);
    expect(metas.map((meta) => meta.content)).toEqual([documentGround("dark", false)]);
  });
});
