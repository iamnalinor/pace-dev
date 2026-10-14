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
  return (
    <SubtaskList
      items={items}
      kept={kept}
      onChange={setItems}
      {...(onRemoveKept !== undefined && { onRemoveKept })}
    />
  );
};

const list = () => screen.getByLabelText(en("form.subtasks"));
/** Each row's text, in order (a sent one's "Sent" aside). */
const rows = (): readonly string[] =>
  within(list())
    .getAllByText(/./u)
    .map((text) => text.props["children"] as string)
    .filter((text) => text !== en("task.subtaskSentLabel"));
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

  it("marks a sent one as sent with no remove; an unsent kept one can be taken off", async () => {
    const onRemoveKept = jest.fn();
    await renderScreen(
      <Harness
        initial={[]}
        kept={[
          { id: "s1", isSent: true, label: "Matrix rank" },
          { id: "s2", isSent: false, label: "Kronecker–Capelli" },
        ]}
        onRemoveKept={onRemoveKept}
      />,
      await createTestRuntime(),
    );
    expect(rows()).toEqual(["Matrix rank", "Kronecker–Capelli"]);
    expect(within(list()).getByText(en("task.subtaskSentLabel"))).toBeOnTheScreen();
    expect(
      screen.queryByRole("button", { name: en("form.removeSubtask", { label: "Matrix rank" }) }),
    ).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", {
        name: en("form.removeSubtask", { label: "Kronecker–Capelli" }),
      }),
    );
    expect(onRemoveKept).toHaveBeenCalledWith("s2");
  });

  it("names the parts in plain words", () => {
    expect(en("form.subtasks")).toBe("Subtasks");
    expect(en("form.addSubtask")).toBe("Add a subtask");
  });
});
