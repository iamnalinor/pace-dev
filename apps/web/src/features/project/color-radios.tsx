import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import { type ProjectColorName, ProjectColorSchema } from "@pace/core";

type Props = {
  readonly label: string;
  readonly value: ProjectColorName;
  readonly onChange: (color: ProjectColorName) => void;
};

/** The eight project colors as round swatches; each is a radio with the color's name. */
export const ColorRadios = ({ label, onChange, value }: Props) => {
  const t = useT();
  return (
    <div aria-label={label} className="flex flex-wrap gap-1" role="radiogroup">
      {ProjectColorSchema.options.map((color) => (
        <button
          aria-checked={color === value}
          aria-label={t(`color.${color}`)}
          className={cn(
            "flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40",
            color === value && "bg-raised",
          )}
          key={color}
          onClick={() => {
            onChange(color);
          }}
          role="radio"
          title={t(`color.${color}`)}
          type="button"
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-5 rounded-full",
              color === value && "ring-2 ring-fg ring-offset-2 ring-offset-bg",
            )}
            style={{ backgroundColor: `var(--color-project-${color})` }}
          />
        </button>
      ))}
    </div>
  );
};
