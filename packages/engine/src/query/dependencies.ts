import fs from 'node:fs';
import path from 'node:path';
import type { RepositoryIndex } from '../indexer/repoIndexer.js';

export type DependenciesQueryResult = {
  schemaVersion: '1.0';
  command: 'query';
  type: 'dependencies';
  module: string | null;
  dependencies: Array<{ name: string; dependencies: string[] }> | string[];
};

const INDEX_RELATIVE_PATH = '.playbook/repo-index.json' as const;

const readRepositoryIndex = (projectRoot: string): RepositoryIndex => {
  const indexPath = path.join(projectRoot, INDEX_RELATIVE_PATH);
  if (!fs.existsSync(indexPath)) {
    throw new Error('playbook query: missing repository index at .playbook/repo-index.json. Run "playbook index" first.');
  }

  const raw = fs.readFileSync(indexPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<RepositoryIndex>;

  if (parsed.schemaVersion !== '1.0') {
    throw new Error(
      `playbook query: unsupported repository index schemaVersion "${String(parsed.schemaVersion)}". Expected "1.0".`
    );
  }

  return parsed as RepositoryIndex;
};

export const queryDependencies = (projectRoot: string, moduleName?: string): DependenciesQueryResult => {
  const index = readRepositoryIndex(projectRoot);

  if (!moduleName) {
    return {
      schemaVersion: '1.0',
      command: 'query',
      type: 'dependencies',
      module: null,
      dependencies: index.modules
    };
  }

  const moduleInfo = index.modules.find((moduleEntry) => moduleEntry.name === moduleName);
  if (!moduleInfo) {
    throw new Error(`playbook query dependencies: unknown module "${moduleName}".`);
  }

  return {
    schemaVersion: '1.0',
    command: 'query',
    type: 'dependencies',
    module: moduleName,
    dependencies: moduleInfo.dependencies
  };
};
