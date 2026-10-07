import { useParams } from "react-router";

import { ProjectView } from "#web/features/project/project-view.tsx";

export const ProjectPage = () => {
  const { id = "" } = useParams();
  return (
    <main className="flex flex-1 flex-col">
      <ProjectView key={id} projectId={id} />
    </main>
  );
};
