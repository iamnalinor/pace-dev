/**
The composer line made of what another app shared: its title, text and link, in that order,
each left out when empty or already inside another part (a browser shares the page's address
both as the link and inside the text).
*/
export const sharedLine = (parts: readonly (null | string | undefined)[]): string => {
  const present = parts.map((part) => part?.trim() ?? "").filter((part) => part !== "");
  return present
    .filter(
      (part, index) =>
        present.indexOf(part) === index &&
        present.every((other) => other === part || !other.includes(part)),
    )
    .join(" ");
};
