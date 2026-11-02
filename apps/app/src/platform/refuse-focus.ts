/**
What a control that must never hold keyboard focus does when something focuses it: nothing on a
phone, where only the screen reader's focus moves (the web build swaps in `refuse-focus.web.ts`).
*/
export const refuseFocus: ((event: object) => void) | undefined = undefined;
