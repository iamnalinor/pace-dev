/**
What a cell of a roving grid that is not its tab stop does when something focuses it: nothing on
a phone, where only the screen reader's focus moves (the web build swaps in
`enter-at-stop.web.ts`).
*/
export const enterAtStop: ((event: object, group: unknown, stop: unknown) => void) | undefined =
  undefined;
