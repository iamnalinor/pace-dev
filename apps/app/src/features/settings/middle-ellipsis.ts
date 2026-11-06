/** A host (ASCII, punycode for the rest) cut in the middle to `max` characters, keeping both ends. */
export const middleEllipsis = (text: string, max: number): string => {
  if (text.length <= max) {
    return text;
  }
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - (keep - head))}`;
};
