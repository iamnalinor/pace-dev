import path from "node:path";

import { headersForPath, parseHeaders, withLocalApi } from "./web-headers.ts";

/**
Serves the web build like the production assets worker does (a single-page app: unknown
paths get `index.html`), with the build's `_headers` applied, so a test meets the production
headers and CSP (F-WEB-16); the CSP's `connect-src` also allows the local API the build was made
for (`EXPO_PUBLIC_API_URL`). Used by the e2e run: `bun scripts/serve-web.ts [dir] [port]`
(`apps/app/dist` and 4173 by default).
*/
const root = process.argv[2] ?? path.join(import.meta.dir, "../apps/app/dist");
const port = Number(process.argv[3] ?? "4173");

const headersFile = Bun.file(`${root}/_headers`);
const rules = (await headersFile.exists()) ? parseHeaders(await headersFile.text()) : [];

/** The `_headers` of a path, as response headers. */
const headersOf = (pathname: string): Headers => {
  const headers = new Headers();
  for (const [name, value] of headersForPath(rules, pathname)) {
    headers.set(
      name,
      name === "content-security-policy"
        ? withLocalApi(value, process.env["EXPO_PUBLIC_API_URL"])
        : value,
    );
  }
  return headers;
};

Bun.serve({
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const headers = headersOf(pathname);
    const file = Bun.file(`${root}${pathname}`);
    if (pathname !== "/" && !pathname.includes("..") && (await file.exists())) {
      return new Response(file, { headers });
    }
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(Bun.file(`${root}/index.html`), { headers });
  },
  port,
});
console.log(`Serving ${root} on http://localhost:${String(port)}`);
