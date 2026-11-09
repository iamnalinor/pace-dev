import type { TextInputProps } from "react-native";

type EnterHandlers = {
  readonly onEnter: () => void;
  readonly onKeyPress: NonNullable<TextInputProps["onKeyPress"]>;
};

/**
How the composer's line takes Enter on a computer: by key, so Shift+Enter still breaks the line
and Alt+Enter goes to the Inbox. The line owns its keys: the page's shortcuts leave it alone.
*/
export const lineEnterProps = ({ onKeyPress }: EnterHandlers): TextInputProps =>
  ({ dataSet: { paceKeys: "own" }, onKeyPress }) as TextInputProps;

/**
What react-native-web 0.21's TextInput reads to keep the cursor after a submit: `blurOnSubmit` (it
has no `submitBehavior`, which React Native's own types now name in its place), and `dataSet`.
*/
type WebEntryProps = {
  readonly blurOnSubmit: false;
  readonly dataSet: { readonly paceKeys: "escape" };
};

const webEntry: WebEntryProps = { blurOnSubmit: false, dataSet: { paceKeys: "escape" } };

/**
A field that takes one entry after another (a subtask, then the next): Enter submits and the
cursor stays; Escape is the field's own (it closes it) rather than the page's (a form's close).
*/
export const entryFieldProps = webEntry as TextInputProps;

/**
A field edited in place inside a pane (the task's description, R24-01): Escape is the field's own
(it cancels the edit) rather than the page's (the pane's close); the next Escape closes the pane.
*/
export const escapeFieldProps = { dataSet: { paceKeys: "escape" } } as TextInputProps;

/**
A single-line field of a sheet (QA round 21 M1): Enter presses the form's action and the cursor
stays in the field, so focus never drops to the page behind the dim (react-native-web 0.21 reads
`blurOnSubmit`).
*/
const webSubmit: Pick<WebEntryProps, "blurOnSubmit"> = { blurOnSubmit: false };

export const submitFieldProps = webSubmit as TextInputProps;
