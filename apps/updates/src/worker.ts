import { serveAsset } from "./asset-response.ts";
import { serveManifest } from "./manifest-response.ts";

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    if (request.method !== "GET") {
      return new Response(null, { status: 405, headers: { allow: "GET" } });
    }
    const path = new URL(request.url).pathname;
    if (path === "/manifest") {
      return await serveManifest(request, env.UPDATES);
    }
    if (path.startsWith("/assets/")) {
      return await serveAsset(path, env.UPDATES);
    }
    return new Response(null, { status: 404 });
  },
};
