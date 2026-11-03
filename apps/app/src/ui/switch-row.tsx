import { ListRow } from "./list-row.tsx";

/**
A setting line (spec §4.2.26): a `ListRow` toggle, the label in `body`, the hint under it in
`footnote` (it wraps), the switch trailing. The whole row is the switch: a press on the label flips
it too (R23-10: «Показать удалённые», the night hours), one tab stop and one ring for the row.
*/
export const SwitchRow = ({
  disabled = false,
  hint,
  isOn,
  label,
  onChange,
}: {
  readonly disabled?: boolean;
  readonly hint?: string;
  readonly label: string;
  readonly onChange: (isOn: boolean) => void;
  readonly isOn: boolean;
}) => <ListRow disabled={disabled} subtitle={hint} title={label} toggle={{ isOn, onChange }} />;
