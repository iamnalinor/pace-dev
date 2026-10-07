/**
Links in user text. A task's link is set explicitly or, when it is not, taken from the
first web address in its source text or description (shown, never written back).
*/
const URL_PATTERN = /https?:\/\/[^\s<>"'«»]+/u;
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

/** `github.com` for `https://www.github.com/x`: what a link chip shows before its title loads. */
export const linkHost = (url: string): string => new URL(url).hostname.replace(/^www\./u, "");
