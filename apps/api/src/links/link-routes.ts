import type { Hono } from "hono";

import { endpoints, ok } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";

import { mount } from "../shared/mount.ts";
import { type Fetcher, fetchPreview } from "./link-preview.ts";

const CACHE_SECONDS = 7 * 24 * 60 * 60;
const CACHE_ORIGIN = "https://link-preview.pace.internal/";

/** Previews are cached per URL with the Cache API: no KV writes, shared by every user. */
export const mountLinkRoutes = (app: Hono<AppEnv>, fetcher: Fetcher): void => {
  mount(app, endpoints.links.preview, async ({ query }) => {
    const cache = await caches.open("link-preview");
    const key = new Request(`${CACHE_ORIGIN}?url=${encodeURIComponent(query.url)}`);
    const hit = await cache.match(key);
    if (hit !== undefined) {
      return ok(endpoints.links.preview.output.parse(await hit.json()));
    }
    const preview = await fetchPreview(query.url, fetcher);
    await cache.put(
      key,
      Response.json(preview, { headers: { "Cache-Control": `max-age=${CACHE_SECONDS}` } }),
    );
    return ok(preview);
  });
};
