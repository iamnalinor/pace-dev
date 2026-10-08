import path from "node:path";

/**
Serves the web build like the production assets worker does (a single-page app: unknown
paths get `index.html`). Used by the e2e run: `bun scripts/serve-web.ts [dir] [port]`
(`apps/app/dist` and 4173 by default).
*/
const root = process.argv[2] ?? path.join(import.meta.dir, "../apps/app/dist");
const port = Number(process.argv[3] ?? "4173");

Bun.serve({
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    const file = Bun.file(`${root}${path}`);
    if (path !== "/" && !path.includes("..") && (await file.exists())) {
      return new Response(file);
    }
    return new Response(Bun.file(`${root}/index.html`), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
  port,
});
console.log(`Serving ${root} on http://localhost:${String(port)}`);
