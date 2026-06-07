export const MIND_GRAPH_ROOT        = 'mind-graph';
export const PROJECTS_FOLDER        = `${MIND_GRAPH_ROOT}/Projects`;
export const DEFAULT_PROJECT_SLUG   = 'default';
export const DEFAULT_PROJECT_NAME   = 'Default';

export const projectFolder   = (slug: string) => `${PROJECTS_FOLDER}/${slug}`;
export const tasksFolder     = (slug: string) => `${projectFolder(slug)}/Tasks`;
export const queueFilePath   = (slug: string) => `${projectFolder(slug)}/queue.md`;
export const backlogFilePath = (slug: string) => `${projectFolder(slug)}/backlog.md`;
export const projectFilePath = (slug: string) => `${projectFolder(slug)}/project.md`;
