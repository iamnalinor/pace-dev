import { useEffect, useState } from "react";

import { useServices } from "#web/app-state.tsx";
import { endpoints, linkHost, type LinkPreview } from "@pace/core";

/** One request per URL per page load; the Worker caches across users and days. */
const cache = new Map<string, Promise<LinkPreview | null>>();

/** A failed request is no preview: the chip keeps showing the host. */
const fetchPreview = async (
  api: ReturnType<typeof useServices>["api"],
  url: string,
): Promise<LinkPreview | null> => {
  try {
    return await api.call(endpoints.links.preview, { query: { url } });
  } catch {
    return null;
  }
};

/** The page title and icon of `url` once the Worker has read them; the host meanwhile. */
export const useLinkPreview = (url: string): LinkPreview => {
  const { api } = useServices();
  const fallback: LinkPreview = { host: linkHost(url), icon: null, title: null, url };
  const [preview, setPreview] = useState<LinkPreview>(fallback);
  useEffect(() => {
    const status = { isCurrent: true };
    const pending = cache.get(url) ?? fetchPreview(api, url);
    cache.set(url, pending);
    void (async () => {
      const value = await pending;
      if (value !== null && status.isCurrent) {
        setPreview(value);
      }
    })();
    return () => {
      status.isCurrent = false;
    };
  }, [api, url]);
  return preview.url === url ? preview : fallback;
};
