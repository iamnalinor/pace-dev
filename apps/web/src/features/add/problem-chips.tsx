import { Plus, X } from "lucide-react";
import { type KeyboardEvent, useId, useState } from "react";

import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { Button } from "#web/shared/ui/button.tsx";

import { splitProblems } from "./add-draft.ts";
import { INPUT_CLASS } from "./input-class.ts";

type Props = {
  readonly problems: readonly string[];
  readonly onChange: (problems: readonly string[]) => void;
};

/** The problems (subtasks) as chips; typing `1, 3, 5а` and Enter adds three. */
export const ProblemChips = ({ onChange, problems }: Props) => {
  const t = useT();
  const id = useId();
  const [input, setInput] = useState("");
  const add = (): void => {
    const added = splitProblems(input);
    if (added.length === 0) {
      return;
    }

    onChange([...problems, ...added]);
    setInput("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    add();
  };
  return (
    <div className="grid gap-2">
      {problems.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {problems.map((label, index) => (
            // Two problems may carry the same label; the position tells them apart.

            <li
              className="flex h-9 items-center gap-1 rounded-md bg-raised pl-2.5 font-mono text-[13px]"
              key={index}
            >
              {label}
              <button
                aria-label={t("add.removeProblem", { label })}
                className="flex size-9 items-center justify-center rounded-md text-muted outline-none hover:text-fg focus-visible:ring-[3px] focus-visible:ring-accent/40"
                onClick={() => {
                  onChange(problems.filter((_, position) => position !== index));
                }}
                type="button"
              >
                <X aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={id}>
          {t("add.addProblems")}
        </label>
        <input
          className={cn(INPUT_CLASS, "h-11 flex-1")}
          id={id}
          onChange={(event) => {
            setInput(event.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder={t("add.problemsPlaceholder")}
          value={input}
        />
        <Button
          aria-label={t("add.addProblemsButton")}
          onClick={add}
          size="icon"
          variant="secondary"
        >
          <Plus aria-hidden="true" strokeWidth={1.75} />
        </Button>
      </div>
    </div>
  );
};
