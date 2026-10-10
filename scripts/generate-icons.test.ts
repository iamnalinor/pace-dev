// The root workspace has no vitest; Bun's runner exposes the same describe/it/expect API.
import { describe, expect, it } from "bun:test";

import { ICONS, LOGO_FILES, pngDimensions, renderPng } from "./generate-icons.ts";

describe("generate-icons", () => {
  it("declares every committed icon with its target size", () => {
    const byPath = new Map(ICONS.map((icon) => [icon.path, icon.size]));
    expect(byPath.get("apps/app/public/icon-192.png")).toBe(192);
    expect(byPath.get("apps/app/public/icon-512.png")).toBe(512);
    expect(byPath.get("apps/app/public/apple-touch-icon.png")).toBe(180);
    expect(byPath.get("apps/app/assets/icon.png")).toBe(1024);
    expect(byPath.get("apps/app/assets/adaptive-icon.png")).toBe(1024);
    expect(byPath.get("apps/app/assets/adaptive-icon-mono.png")).toBe(1024);
    expect(byPath.get("apps/app/assets/splash-icon.png")).toBe(1024);
    expect(byPath.get("apps/app/assets/notification-icon.png")).toBe(96);
  });

  it("renders every icon as a square PNG of the declared size", () => {
    for (const icon of ICONS) {
      const png = renderPng(icon.svg, icon.size);
      expect(pngDimensions(png), icon.path).toEqual({ height: icon.size, width: icon.size });
    }
  });

  it("renders deterministically", () => {
    const [first] = ICONS;
    if (first === undefined) {
      throw new Error("no icons");
    }
    expect(renderPng(first.svg, first.size).equals(renderPng(first.svg, first.size))).toBe(true);
  });

  it("ships the logo SVGs with the board 08 palettes", () => {
    const svg = Object.fromEntries(LOGO_FILES.map((file) => [file.path, file.svg]));
    expect(svg["assets/logo/pace-mark.svg"]).toContain("#d4ff3a");
    expect(svg["assets/logo/pace-mark.svg"]).toContain("#6a6a74");
    expect(svg["assets/logo/pace-mark.svg"]).not.toContain("#0b0b0c");
    expect(svg["assets/logo/pace-mark-light.svg"]).toContain("#b9bcc6");
    expect(svg["assets/logo/pace-mark-light.svg"]).toContain("#17181c");
    expect(svg["assets/logo/pace-wordmark.svg"]).toContain(">pace<");
    expect(svg["assets/logo/pace-wordmark.svg"]).toContain("Inter, system-ui, sans-serif");
    expect(svg["assets/logo/favicon.svg"]).toContain("#d4ff3a");
    expect(svg["assets/logo/favicon.svg"]).not.toContain("<circle");
    expect(svg["apps/app/public/favicon.svg"]).toBe(svg["assets/logo/favicon.svg"]);
  });

  it("parses PNG headers", () => {
    const png = renderPng('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"></svg>', 10);
    expect(pngDimensions(png)).toEqual({ height: 20, width: 10 });
  });
});
