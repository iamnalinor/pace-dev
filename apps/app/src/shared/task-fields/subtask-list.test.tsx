import { fireEvent, screen, within } from "@testing-library/react-native";
import { useState } from "react";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { type KeptSubtask, SubtaskList } from "./subtask-list.tsx";

/** The editor over a list it owns, as the forms keep it. */
const Harness = ({
  initial,
  kept,
  onRemoveKept,
}: {
  readonly initial: readonly string[];
  readonly kept?: readonly KeptSubtask[];
  readonly onRemoveKept?: (id: string) => void;
}) => {
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");
  return (
    <SubtaskList
      draft={draft}
      items={items}
      kept={kept}
      onChange={setItems}
      onDraftChange={setDraft}
      {...(onRemoveKept !== undefined && { onRemoveKept })}
    />
  );
};

const list = () => screen.getByLabelText(en("form.subtasks"));
/** Each row's text, in order (a done one's "Done" aside). */
const rows = (): readonly string[] =>
  within(list())
    .getAllByText(/./u)
    .map((text) => text.props["children"] as string)
    .filter((text) => text !== en("task.subtaskDoneLabel"));
const addButton = () => screen.getByRole("button", { name: en("form.addSubtask") });
const input = () => screen.getByPlaceholderText(en("form.addSubtask"));

describe("SubtaskList", () => {
  it("is a plain list of rows, each with its own remove, and no dashed pill", async () => {
    await renderScreen(<Harness initial={["290", "Bonus"]} />, await createTestRuntime());
    expect(screen.getByText(en("form.subtasks"))).toBeOnTheScreen();
    expect(rows()).toEqual(["290", "Bonus"]);
    // Adding is a text button until it is pressed: no empty field waiting in the form.
    expect(screen.queryByPlaceholderText(en("form.addSubtask"))).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: en("form.removeSubtask", { label: "290" }) }),
    );
    expect(rows()).toEqual(["Bonus"]);
  });

  it("turns Add a subtask into a field: Enter adds and keeps it open for the next one", async () => {
    await renderScreen(<Harness initial={[]} />, await createTestRuntime());
    await fireEvent.press(addButton());
    expect(input()).toHaveProp("autoFocus", true);
    await fireEvent.changeText(input(), "8");
    await fireEvent(input(), "submitEditing");
    await fireEvent.changeText(input(), "9");
    await fireEvent(input(), "submitEditing");
    expect(rows()).toEqual(["8", "9"]);
    expect(input()).toHaveDisplayValue("");
  });

  it("closes the field when it is left empty or on Escape", async () => {
    await renderScreen(<Harness initial={[]} />, await createTestRuntime());
    await fireEvent.press(addButton());
    await fireEvent(input(), "blur");
    expect(screen.queryByPlaceholderText(en("form.addSubtask"))).toBeNull();
    await fireEvent.press(addButton());
    await fireEvent.changeText(input(), "half-typed");
    await fireEvent(input(), "keyPress", { nativeEvent: { key: "Escape" } });
    expect(screen.queryByPlaceholderText(en("form.addSubtask"))).toBeNull();
    expect(addButton()).toBeOnTheScreen();
    expect(screen.queryByLabelText(en("form.subtasks"))).toBeNull();
  });

  it("keeps a typed one when the field is left, to come back to", async () => {
    await renderScreen(<Harness initial={[]} />, await createTestRuntime());
    await fireEvent.press(addButton());
    await fireEvent.changeText(input(), "Bonus");
    await fireEvent(input(), "blur");
    expect(input()).toHaveDisplayValue("Bonus");
  });

  it("marks a done one as done; every kept one can be taken off (History brings it back)", async () => {
    const onRemoveKept = jest.fn();
    await renderScreen(
      <Harness
        initial={[]}
        kept={[
          { id: "s1", isDone: true, label: "Matrix rank" },
          { id: "s2", isDone: false, label: "Kronecker–Capelli" },
        ]}
        onRemoveKept={onRemoveKept}
      />,
      await createTestRuntime(),
    );
    expect(rows()).toEqual(["Matrix rank", "Kronecker–Capelli"]);
    expect(within(list()).getAllByText(en("task.subtaskDoneLabel"))).toHaveLength(1);
    for (const [label, id] of [
      ["Matrix rank", "s1"],
      ["Kronecker–Capelli", "s2"],
    ] as const) {
      await fireEvent.press(
        screen.getByRole("button", { name: en("form.removeSubtask", { label }) }),
      );
      expect(onRemoveKept).toHaveBeenCalledWith(id);
    }
  });

  it("names the parts in plain words", () => {
    expect(en("form.subtasks")).toBe("Subtasks");
    expect(en("form.addSubtask")).toBe("Add a subtask");
  });
});
