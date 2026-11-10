import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";

import { Button } from "./button.tsx";
import { TextField } from "./text-field.tsx";
import { ThemeProvider } from "./theme-provider.tsx";
import { DraftOwnerContext, forgetDrafts, useDiscardDraft } from "./use-draft.ts";

const Field = ({
  draftKey = "test.field",
  initial = "",
}: {
  /** `null`: a field that keeps nothing. */
  readonly draftKey?: null | string;
  readonly initial?: string;
}) => {
  const [text, setText] = useState(initial);
  const discard = useDiscardDraft();
  return (
    <>
      <TextField
        draftKey={draftKey ?? undefined}
        label="Note"
        onChangeText={setText}
        value={text}
      />
      <Button
        onPress={() => {
          setText("");
        }}
      >
        Send
      </Button>
      <Button
        onPress={() => {
          discard(draftKey ?? undefined);
          setText(initial);
        }}
      >
        Cancel
      </Button>
    </>
  );
};

/** A page load: the field mounts afresh, signed in as `session` (or signed out). */
const load = async (
  props: Parameters<typeof Field>[0] = {},
  session: null | string = "session-a",
) =>
  await render(
    <ThemeProvider forced="light">
      <DraftOwnerContext value={() => session ?? undefined}>
        <Field {...props} />
      </DraftOwnerContext>
    </ThemeProvider>,
  );

const field = () => screen.getByLabelText("Note");

describe("drafts survive a reload (feedback 5 item 7)", () => {
  it("restores what was typed after the field mounts again", async () => {
    const page = await load();
    await fireEvent.changeText(field(), "Buy milk");
    await page.unmount();
    await load();
    expect(field()).toHaveDisplayValue("Buy milk");
  });

  it("clears the draft when the text is sent (the field empties)", async () => {
    const page = await load();
    await fireEvent.changeText(field(), "Buy milk");
    await fireEvent.press(screen.getByText("Send"));
    await page.unmount();
    await load();
    expect(field()).toHaveDisplayValue("");
  });

  it("clears the draft when the person empties the field", async () => {
    const page = await load();
    await fireEvent.changeText(field(), "Buy milk");
    await fireEvent.changeText(field(), "");
    await page.unmount();
    await load();
    expect(field()).toHaveDisplayValue("");
  });

  it("never shows a draft to another account, nor keeps one signed out (class 103)", async () => {
    const page = await load();
    await fireEvent.changeText(field(), "Alice's words");
    await page.unmount();
    const other = await load({}, "session-b");
    expect(field()).toHaveDisplayValue("");
    await other.unmount();
    const signedOut = await load({}, null);
    await fireEvent.changeText(field(), "typed signed out");
    await signedOut.unmount();
    await load({}, null);
    expect(field()).toHaveDisplayValue("");
  });

  it("forgets every draft on sign-out", async () => {
    const page = await load();
    await fireEvent.changeText(field(), "Buy milk");
    await page.unmount();
    forgetDrafts();
    await load();
    expect(field()).toHaveDisplayValue("");
  });

  it("restores an edit only over the value it was made from", async () => {
    const first = await load({ initial: "Essay" });
    await fireEvent.changeText(field(), "Essay, second draft");
    await first.unmount();
    const same = await load({ initial: "Essay" });
    expect(field()).toHaveDisplayValue("Essay, second draft");
    await same.unmount();
    // The title changed meanwhile (saved here or on another device): the old edit is stale.
    const changed = await load({ initial: "Essay (final)" });
    expect(field()).toHaveDisplayValue("Essay (final)");
    await changed.unmount();
    await load({ initial: "Essay" });
    expect(field()).toHaveDisplayValue("Essay");
  });

  it("drops a draft the person cancels", async () => {
    const page = await load({ initial: "Essay" });
    await fireEvent.changeText(field(), "Essay, edited");
    await fireEvent.press(screen.getByText("Cancel"));
    await page.unmount();
    await load({ initial: "Essay" });
    expect(field()).toHaveDisplayValue("Essay");
  });

  it("keeps nothing for a field without a draft key", async () => {
    const page = await load({ draftKey: null });
    await fireEvent.changeText(field(), "secret code");
    await page.unmount();
    await load({ draftKey: null });
    expect(field()).toHaveDisplayValue("");
  });
});
