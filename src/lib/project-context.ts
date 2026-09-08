/** Active project identity used only to namespace project-owned Page state. */
let currentProjectId = 'default';
let projectListeners: Array<(projectId: string) => void> = [];

const PAGE_ONLY_MIGRATION_KEY = 'forgeax:migrations:page-only-v1';

function discardRetiredGlobalLayouts(): void {
  if (typeof localStorage === 'undefined' || localStorage.getItem(PAGE_ONLY_MIGRATION_KEY) === 'done') return;
  const retiredShellTerm = ['work', 'bench'].join('');
  const retired = new RegExp(`(?:${retiredShellTerm}|ws-layout|panel-locations|app-mode)`, 'i');
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && retired.test(key)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
  localStorage.setItem(PAGE_ONLY_MIGRATION_KEY, 'done');
}

export function setCurrentProject(projectId: string): void {
  discardRetiredGlobalLayouts();
  if (!projectId || projectId === currentProjectId) return;
  currentProjectId = projectId;
  projectListeners.forEach((listener) => {
    try { listener(projectId); } catch { /* isolated observer */ }
  });
}

export function getCurrentProject(): string {
  discardRetiredGlobalLayouts();
  return currentProjectId;
}

export function subscribeCurrentProject(listener: (projectId: string) => void): () => void {
  projectListeners.push(listener);
  return () => { projectListeners = projectListeners.filter((candidate) => candidate !== listener); };
}

export function __resetCurrentProjectIdForTests(): void {
  currentProjectId = 'default';
  projectListeners = [];
}
