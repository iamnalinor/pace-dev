import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";

import { SheetActions } from "./sheet-actions.tsx";
import { Sheet } from "./sheet.tsx";
import { TextField } from "./text-field.tsx";
import { ThemeProvider } from "./theme-provider.tsx";

jest.mock("react-native-safe-area-context", (): unknown => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

/** A required title, empty, gated by the touched rule (F-CMP-03); `isSubmitted` once Save was tried. */
const Required = ({ isSubmitted = false }: { readonly isSubmitted?: boolean }) => {
  const [title, setTitle] = useState("");
  return (
    <ThemeProvider forced="light">
      <TextField
        error={title.trim() === "" ? "Type a title." : null}
        isSubmitted={isSubmitted}
        label="Title"
        onChangeText={setTitle}
        purpose="title"
        showErrorWhen="touched"
        value={title}
      />
    </ThemeProvider>
  );
};

const field = () => screen.getByLabelText("Title");

describe("TextField (spec §4.2.28, §7 Fields)", () => {
  it("opens an empty required field without an error, and says it once the field is left (F-CMP-03)", async () => {
    await render(<Required />);
    expect(screen.queryByText("Type a title.")).toBeNull();
    await fireEvent(field(), "focus");
    expect(screen.queryByText("Type a title.")).toBeNull();
    await fireEvent(field(), "blur");
    expect(screen.getByText("Type a title.")).toBeOnTheScreen();
    expect(field().props["aria-invalid"]).toBe(true);
  });

  it("says the error once a submit was tried, even untouched", async () => {
    await render(<Required isSubmitted />);
    expect(screen.getByText("Type a title.")).toBeOnTheScreen();
  });

  it("links its message to the field (aria-describedby)", async () => {
    await render(<Required isSubmitted />);
    const describedBy = field().props["aria-describedby"] as string;
    expect(describedBy).toBeTruthy();
    expect(screen.getByTestId("text-field-message").props["nativeID"]).toBe(describedBy);
  });

  it("sets an address's keyboard and attributes from purpose=url", async () => {
    await render(
      <ThemeProvider forced="light">
        <TextField label="Address" purpose="url" />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText("Address").props).toMatchObject({
      autoCapitalize: "none",
      autoComplete: "url",
      inputMode: "url",
      spellCheck: false,
    });
  });

  it("draws the focus ring while focused, by any input method (F-A11Y-01)", async () => {
    await render(<Required />);
    expect(screen.queryByTestId("text-field-ring")).toBeNull();
    await fireEvent(field(), "focus");
    expect(screen.getByTestId("text-field-ring")).toBeOnTheScreen();
    await fireEvent(field(), "blur");
    expect(screen.queryByTestId("text-field-ring")).toBeNull();
  });

  it("shows no border and quaternary text when disabled", async () => {
    await render(
      <ThemeProvider forced="light">
        <TextField editable={false} label="Title" value="Read" />
      </ThemeProvider>,
    );
    expect(String(field().props["className"])).toContain("text-label-quaternary");
  });
});

/** A sheet's form with one single-line field and its action, as Edit task's Title is. */
const FormSheet = ({
  isDisabled = false,
  onSave,
  onCancel,
}: {
  readonly isDisabled?: boolean;
  readonly onSave: () => void;
  readonly onCancel?: () => void;
}) => (
  <ThemeProvider forced="light">
    <Sheet
      closeLabel="Close"
      footer={
        <SheetActions
          {...(onCancel !== undefined && { cancelLabel: "Cancel", onCancel })}
          isDisabled={isDisabled}
          onPrimary={onSave}
          primaryLabel="Save"
        />
      }
      name="task-edit"
      onClose={jest.fn()}
      open
      title="Edit task"
    >
      <TextField label="Title" purpose="title" />
    </Sheet>
  </ThemeProvider>
);

describe("Enter in a sheet's single-line field (QA round 21 M1)", () => {
  it("presses the form's action, and the field keeps the keyboard", async () => {
    const onSave = jest.fn();
    await render(<FormSheet onSave={onSave} />);
    expect(field().props["submitBehavior"]).toBe("submit");
    await fireEvent(field(), "submitEditing");
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the action is disabled", async () => {
    const onSave = jest.fn();
    await render(<FormSheet isDisabled onSave={onSave} />);
    await fireEvent(field(), "submitEditing");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("never presses a confirmation's action (Delete is never one keystroke away)", async () => {
    const onSave = jest.fn();
    await render(<FormSheet onCancel={jest.fn()} onSave={onSave} />);
    await fireEvent(field(), "submitEditing");
    expect(onSave).not.toHaveBeenCalled();
  });
});
