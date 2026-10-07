import { useEffect, useState } from "react";

import type { LinkPreview } from "@pace/core";

import { useServices } from "#web/app-state.tsx";
import { endpoints, linkHost } from "@pace/core";

/** One request per URL per page load; the Worker caches across users and days. */
const cache = new Map<string, Promise<LinkPreview | null>>();

/** The page title and icon of `url` once the Worker has read them; the host meanwhile. */
export const useLinkPreview = (url: string): LinkPreview => {
  const { api } = useServices();
  const fallback: LinkPreview = { host: linkHost(url), icon: null, title: null, url };
  const [preview, setPreview] = useState<LinkPreview>(fallback);
  useEffect(() => {
    let isCurrent = true;
    const pending =
      cache.get(url) ??
      api.call(endpoints.links.preview, { query: { url } }).then(
        (value) => value,
        () => null,
      );
    cache.set(url, pending);
    void pending.then((value) => {
      if (isCurrent && value !== null) {
        setPreview(value);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [api, url]);
  return preview.url === url ? preview : fallback;
};
