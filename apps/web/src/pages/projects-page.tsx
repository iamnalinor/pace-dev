import { ProjectsList } from "#web/features/project/projects-list.tsx";
import { useT } from "#web/i18n.tsx";
import { PageHeader } from "#web/shared/ui/page-header.tsx";

export const ProjectsPage = () => {
  const t = useT();
  return (
    <main className="flex flex-1 flex-col pb-6">
      <PageHeader title={t("nav.projects")} />
      <ProjectsList />
    </main>
  );
};
