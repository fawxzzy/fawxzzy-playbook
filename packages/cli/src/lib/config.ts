import { loadConfig } from '@zachariahredfield/playbook-engine';

export const readConfig = (repoRoot: string) => loadConfig(repoRoot);
