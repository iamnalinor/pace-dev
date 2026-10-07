import { linkHost, type LinkPreview } from "@pace/core";

/** Pages larger than this are read only up to here: the head is all a preview needs. */
const MAX_BYTES = 64 * 1024;
const TIMEOUT_MS = 3000;
const TITLE_MAX = 200;

const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&gt;": ">",
  "&lt;": "<",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

const decode = (text: string): string =>
  text
    .replaceAll(/&(?:amp|lt|gt|quot|#39|nbsp);/gu, (entity) => ENTITIES[entity] ?? entity)
    .replaceAll(/\s+/gu, " ")
    .trim();

const metaContent = (html: string, property: string): null | string => {
  const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`, "iu").exec(html);
  const content = tag === null ? null : /content=["']([^"']*)["']/iu.exec(tag[0]);
  return content?.[1] === undefined ? null : decode(content[1]);
};

const iconHref = (html: string): null | string => {
  const link = /<link[^>]+rel=["'][^"']*\bicon\b[^"']*["'][^>]*>/iu.exec(html);
  const href = link === null ? null : /href=["']([^"']+)["']/iu.exec(link[0]);
  return href?.[1] ?? null;
};

/** Title (og:title, else <title>) and an absolute icon URL from a page's HTML. */
export const parsePreview = (
  html: string,
  pageUrl: string,
): Pick<LinkPreview, "icon" | "title"> => {
  const titleTag = /<title[^>]*>([^<]*)<\/title>/iu.exec(html)?.[1];
  const title = metaContent(html, "og:title") ?? (titleTag === undefined ? null : decode(titleTag));
  const href = iconHref(html) ?? "/favicon.ico";
  let icon: null | string = null;
  try {
    const resolved = new URL(href, pageUrl);
    icon = resolved.protocol === "https:" ? resolved.href : null;
  } catch {
    icon = null;
  }
  return { icon, title: title === null || title === "" ? null : title.slice(0, TITLE_MAX) };
};

const readHead = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return "";
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel();
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
};

export type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Reads a page's head to name its link. Never throws: an unreachable page or a non-HTML
 * answer yields a preview with only the host. Private addresses are refused by the
 * Worker runtime (`global_fetch_strictly_public`).
 */
export const fetchPreview = async (url: string, fetcher: Fetcher): Promise<LinkPreview> => {
  const base = { host: linkHost(url), icon: null, title: null, url };
  try {
    const response = await fetcher(url, {
      headers: { Accept: "text/html", "User-Agent": "PaceLinkPreview/1.0 (+https://pace.nalinor.dev)" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.includes("text/html")) {
      return base;
    }
    return { ...base, ...parsePreview(await readHead(response), response.url || url) };
  } catch {
    return base;
  }
};
