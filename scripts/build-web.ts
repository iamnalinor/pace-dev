/**
The web build: Expo's static export of the app into `apps/app/dist/` (the files of `public/`
are copied along) with the desktop bridge script, then a Workbox service worker that precaches it. The worker waits instead of taking
over, so the page can offer "Reload" when a new version is ready (`src/platform/sw.web.tsx`).
*/
import path from "node:path";
import { generateSW } from "workbox-build";

const APP = path.join(import.meta.dir, "../apps/app");
const OUT = path.join(APP, "dist");
const MAX_PRECACHE_BYTES = 8 * 1024 * 1024;

// Without tree shaking every lucide icon ships (Metro keeps whole modules): 5.6 MB → 3.3 MB.
const exported = Bun.spawnSync(
  ["bunx", "expo", "export", "--platform", "web", "--output-dir", OUT, "--clear"],
  {
    env: {
      ...process.env,
      EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH: "1",
      EXPO_UNSTABLE_TREE_SHAKING: "1",
    },
    stderr: "inherit",
    stdout: "inherit",
  },
);
if (exported.exitCode !== 0) {
  process.exit(exported.exitCode);
}

// The desktop bridge is served next to the app, so Settings → Devices can give one command.
await Bun.write(
  path.join(OUT, "pace_aw_bridge.py"),
  Bun.file(path.join(import.meta.dir, "../tools/pace-aw-bridge/pace_aw_bridge.py")),
);

const { count, size, warnings } = await generateSW({
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  globDirectory: OUT,
  globPatterns: ["**/*.{js,css,html,svg,png,woff2,ttf,json,webmanifest}"],
  globIgnores: [".well-known/**", "_headers", "**/*.map"],
  maximumFileSizeToCacheInBytes: MAX_PRECACHE_BYTES,
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [/^\/api/u, /^\/oauth/u, /^\/\.well-known/u],
  swDest: path.join(OUT, "sw.js"),
});
for (const warning of warnings) {
  console.warn(warning);
}
console.log(`sw.js precaches ${String(count)} files (${String(Math.round(size / 1024))} KiB)`);
