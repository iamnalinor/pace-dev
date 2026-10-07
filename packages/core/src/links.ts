/**
 * Links in user text. A task's link is set explicitly or, when it is not, taken from the
 * first web address in its source text or description (shown, never written back).
 */
const URL_PATTERN = /https?:\/\/[^\s<>"'«»]+/u;
/** Punctuation that ends a sentence rather than the address. */
const TRAILING = /[).,;:!?\]]+$/u;

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
  const candidate = match[0].replace(TRAILING, "");
  return isHttpUrl(candidate) ? candidate : null;
};

/** `github.com` for `https://www.github.com/x`: what a link chip shows before its title loads. */
export const linkHost = (url: string): string => new URL(url).hostname.replace(/^www\./u, "");
