import { type ReactNode, useId } from "react";

/** One row of the fields card: a muted label over its control, rows split by hairlines. */
export const Field = ({
  children,
  label,
}: {
  readonly label: string;
  readonly children: (id: string) => ReactNode;
}) => {
  const id = useId();
  return (
    <div className="grid gap-2 border-t border-line py-2.5 first:border-t-0">
      <label className="text-[13px] text-muted" htmlFor={id}>
        {label}
      </label>
      {children(id)}
    </div>
  );
};

/** A row whose control is a group (radios, chips): the label names the group, not an input. */
export const GroupRow = ({
  children,
  label,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) => (
  <div className="grid gap-2 border-t border-line py-2.5 first:border-t-0">
    <span className="text-[13px] text-muted">{label}</span>
    {children}
  </div>
);
