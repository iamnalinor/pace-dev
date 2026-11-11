// The root workspace has no vitest; Bun's runner exposes the same describe/it/expect API.
import { describe, expect, it } from "bun:test";

import { color } from "@pace/core";

import { ICONS, LOGO_FILES, pngDimensions, renderPng } from "./generate-icons.ts";

// Rendering every icon (up to 1024 px) takes about 6 s on a loaded CI runner, past Bun's default
// 5 s per test, so the timeout is explicit.
const RENDER_ALL_MS = 60_000;

describe("generate-icons", () => {
  it("declares every committed icon with its target size", () => {
    const byPath = new Map(ICONS.map((icon) => [icon.path, icon.size]));
    expect(byPath.get("apps/app/public/icon-192.png")).toBe(192);
    expect(byPath.get("apps/app/public/icon-512.png")).toBe(512);
    expect(byPath.get("apps/app/public/icon-maskable-512.png")).toBe(512);
    expect(byPath.get("apps/app/public/apple-touch-icon.png")).toBe(180);
    expect(byPath.get("apps/app/assets/icon.png")).toBe(1024);
    expect(byPath.get("apps/app/assets/adaptive-icon.png")).toBe(1024);
    expect(byPath.get("apps/app/assets/adaptive-icon-mono.png")).toBe(1024);
    expect(byPath.get("apps/app/assets/splash-icon.png")).toBe(1024);
    expect(byPath.get("apps/app/assets/notification-icon.png")).toBe(96);
  });

  it("installs the web app with the phone's icon, the bot avatar's look", () => {
    const svgOf = new Map(ICONS.map((icon) => [icon.path, icon.svg]));
    const app = svgOf.get("apps/app/assets/icon.png");
    for (const web of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
      expect(svgOf.get(`apps/app/public/${web}`), web).toBe(app);
    }
    expect(svgOf.get("assets/logo/bot-avatar.png")).toBe(app);
  });

  it(
    "renders every icon as a square PNG of the declared size",
    () => {
      for (const icon of ICONS) {
        const png = renderPng(icon.svg, icon.size);
        expect(pngDimensions(png), icon.path).toEqual({ height: icon.size, width: icon.size });
      }
    },
    RENDER_ALL_MS,
  );

  it("renders deterministically", () => {
    const [first] = ICONS;
    if (first === undefined) {
      throw new Error("no icons");
    }
    expect(renderPng(first.svg, first.size).equals(renderPng(first.svg, first.size))).toBe(true);
  });

  it("ships the logo SVGs with the board 08 shapes in the brand lime", () => {
    const svg = Object.fromEntries(LOGO_FILES.map((file) => [file.path, file.svg]));
    expect(svg["assets/logo/pace-mark.svg"]).toContain(color("dark", "logo"));
    expect(svg["assets/logo/pace-mark.svg"]).toContain("#6a6a74");
    expect(svg["assets/logo/pace-mark.svg"]).not.toContain(color("dark", "bg.app"));
    expect(svg["assets/logo/pace-mark-light.svg"]).toContain("#b9bcc6");
    expect(svg["assets/logo/pace-mark-light.svg"]).toContain(color("light", "logo"));
    expect(svg["assets/logo/pace-wordmark.svg"]).toContain(">pace<");
    expect(svg["assets/logo/pace-wordmark.svg"]).toContain("Inter, system-ui, sans-serif");
    // The favicon is a lime tile with dark chevrons.
    expect(svg["assets/logo/favicon.svg"]).toContain(`fill="${color("dark", "logo")}"`);
    expect(svg["assets/logo/favicon.svg"]).toContain(`stroke="${color("dark", "bg.app")}"`);
    const everything = Object.values(svg).join("");
    expect(everything).not.toContain("#4263eb");
    expect(everything).not.toContain("#91a7ff");
    expect(svg["assets/logo/favicon.svg"]).not.toContain("<circle");
  });

  it("draws the tab's favicon in the lime of the tab strip's scheme (F-WEB-15; owner, round 2)", () => {
    const svg = Object.fromEntries(LOGO_FILES.map((file) => [file.path, file.svg]));
    const favicon = svg["apps/app/public/favicon.svg"] ?? "";
    expect(color("light", "logo").toLowerCase()).toBe("#5e8c00");
    expect(color("dark", "logo").toLowerCase()).toBe("#c8f03c");
    expect(favicon).toContain(`.tile { fill: ${color("light", "logo")}; }`);
    expect(favicon).toContain(
      `@media (prefers-color-scheme: dark) { .tile { fill: ${color("dark", "logo")}; } }`,
    );
    expect(favicon).toContain(`stroke="${color("dark", "bg.app")}"`);
  });

  it("parses PNG headers", () => {
    const png = renderPng('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"></svg>', 10);
    expect(pngDimensions(png)).toEqual({ height: 20, width: 10 });
  });
});
