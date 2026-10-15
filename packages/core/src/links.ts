/**
Links in user text. A task's link is set explicitly or, when it is not, taken from the
first web address in its source text or description (shown, never written back).
*/
const URL_PATTERN = /https?:\/\/[^\s<>"'«»]+/u;
/** The same, for every address in a text. */
const URL_PATTERN_ALL = /https?:\/\/[^\s<>"'«»]+/gu;
/** Punctuation that ends a sentence rather than the address. */
const TRAILING = ").,;:!?]";

const trimTrailing = (text: string): string => {
  const last = text.at(-1);
  return last !== undefined && TRAILING.includes(last) ? trimTrailing(text.slice(0, -1)) : text;
};

export const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

/** The first http(s) address in `text`, without trailing punctuation, or null. */
export const extractLink = (text: null | string): null | string => {
  if (text === null) {
    return null;
  }
  const match = URL_PATTERN.exec(text);
  if (match === null) {
    return null;
  }
  const candidate = trimTrailing(match[0]);
  return isHttpUrl(candidate) ? candidate : null;
};

/** A piece of user text, from `at` in it: plain, or a web address to open. */
export type TextPart = { readonly at: number; readonly text: string } & (
  | { readonly kind: "link"; readonly url: string }
  | { readonly kind: "text" }
);

/** Where each web address in `text` starts, and the address without trailing punctuation. */
const linksIn = (text: string): readonly { readonly at: number; readonly url: string }[] =>
  text
    .matchAll(URL_PATTERN_ALL)
    .map((match) => ({ at: match.index, url: trimTrailing(match[0]) }))
    .filter((link) => isHttpUrl(link.url))
    .toArray();

/** Every http(s) address in `text`, in order. */
export const allLinks = (text: null | string): readonly string[] =>
  text === null ? [] : linksIn(text).map((link) => link.url);

/**
`text` cut into plain parts and the web addresses in it, so each address can be tapped; the
parts joined give the text back.
*/
export const splitLinks = (text: string): readonly TextPart[] => {
  const links = linksIn(text);
  const endOf = (link: (typeof links)[number] | undefined): number =>
    link === undefined ? 0 : link.at + link.url.length;
  const plain = (from: number, to: number): readonly TextPart[] =>
    to > from ? [{ at: from, kind: "text", text: text.slice(from, to) }] : [];
  return [
    ...links.flatMap((link, index): readonly TextPart[] => [
      ...plain(endOf(links[index - 1]), link.at),
      { at: link.at, kind: "link", text: link.url, url: link.url },
    ]),
    ...plain(endOf(links.at(-1)), text.length),
  ];
};

/** `github.com` for `https://www.github.com/x`: what a link chip shows before its title loads. */
export const linkHost = (url: string): string => new URL(url).hostname.replace(/^www\./u, "");
