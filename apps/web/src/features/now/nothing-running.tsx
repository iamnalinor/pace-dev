import { useT } from "#web/i18n.tsx";

/** Where the focus bar sits once stage 3 tracks time: a quiet placeholder until then. */
export const NothingRunning = () => {
  const t = useT();
  return (
    <section className="mx-4 mb-3 flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-faint" />
      <p className="text-sm text-muted">{t("now.nothingRunning")}</p>
    </section>
  );
};
