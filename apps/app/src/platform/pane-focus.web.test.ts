import { type FocusNode, focusOpenerOnClose, focusPaneOnOpen } from "./pane-focus.web.ts";

/** An element: its children (by identity) and its focus calls. */
const element = (children: readonly FocusNode[] = [], isConnected = true) => {
  const focus = jest.fn();
  const setAttribute = jest.fn();
  const node: FocusNode = {
    contains: (other) => other === node || (other !== null && children.includes(other)),
    focus,
    isConnected,
    setAttribute,
  };
  return { focus, node, setAttribute };
};

describe("an inspector pane's focus on the web (UI review I4)", () => {
  it("takes the focus when it opens, by script only, and remembers the opener outside it", () => {
    const row = element();
    const pane = element();
    expect(focusPaneOnOpen(pane.node, row.node)).toBe(row.node);
    expect(pane.setAttribute).toHaveBeenCalledWith("tabindex", "-1");
    expect(pane.focus).toHaveBeenCalledTimes(1);
  });

  it("leaves a field in the pane that took the focus as it mounted", () => {
    const field = element();
    const pane = element([field.node]);
    expect(focusPaneOnOpen(pane.node, field.node)).toBeNull();
    expect(pane.focus).not.toHaveBeenCalled();
  });

  it("gives the focus back to the opener when it was in the pane or nowhere", () => {
    const close = element();
    const pane = element([close.node]);
    const row = element();
    focusOpenerOnClose(pane.node, { active: close.node, body: null, opener: row.node });
    expect(row.focus).toHaveBeenCalledTimes(1);
    const body = element();
    focusOpenerOnClose(pane.node, { active: body.node, body: body.node, opener: row.node });
    expect(row.focus).toHaveBeenCalledTimes(2);
  });

  it("leaves focus the person put elsewhere, and an opener that is gone", () => {
    const pane = element();
    const row = element();
    const search = element();
    focusOpenerOnClose(pane.node, { active: search.node, body: null, opener: row.node });
    expect(row.focus).not.toHaveBeenCalled();
    const gone = element([], false);
    focusOpenerOnClose(pane.node, { active: null, body: null, opener: gone.node });
    expect(gone.focus).not.toHaveBeenCalled();
  });
});
