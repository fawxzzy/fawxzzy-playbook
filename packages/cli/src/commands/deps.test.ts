import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { listRegisteredCommands } from './index.js';
import { runDeps } from './deps.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

const writeRepoIndex = (repo: string): void => {
  const indexPath = path.join(repo, '.playbook', 'repo-index.json');
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(
    indexPath,
    JSON.stringify(
      {
        schemaVersion: '1.0',
        framework: 'nextjs',
        language: 'typescript',
        architecture: 'modular-monolith',
        modules: [
          { name: 'auth', dependencies: [] },
          { name: 'db', dependencies: [] },
          { name: 'workouts', dependencies: ['auth', 'db'] }
        ],
        database: 'supabase',
        rules: ['requireNotesOnChanges']
      },
      null,
      2
    )
  );
};

describe('runDeps', () => {
  it('prints full dependency graph', async () => {
    const repo = createRepo('playbook-cli-deps-all');
    writeRepoIndex(repo);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runDeps(repo, [], { format: 'text', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      'Dependencies',
      '────────────',
      'auth: none',
      'db: none',
      'workouts: auth, db'
    ]);

    logSpy.mockRestore();
  });

  it('prints module dependencies', async () => {
    const repo = createRepo('playbook-cli-deps-module');
    writeRepoIndex(repo);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runDeps(repo, ['workouts'], { format: 'text', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual(['Dependencies', '────────────', 'workouts: auth, db']);

    logSpy.mockRestore();
  });

  it('fails for unknown module', async () => {
    const repo = createRepo('playbook-cli-deps-missing');
    writeRepoIndex(repo);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const exitCode = await runDeps(repo, ['missing'], { format: 'text', quiet: false });

    expect(exitCode).toBe(ExitCode.Failure);
    expect(errorSpy).toHaveBeenCalledWith('playbook query dependencies: unknown module "missing".');

    errorSpy.mockRestore();
  });
});

describe('command registry', () => {
  it('registers the deps command', () => {
    const command = listRegisteredCommands().find((entry) => entry.name === 'deps');

    expect(command).toBeDefined();
    expect(command?.description).toBe('Print module dependency graph from .playbook/repo-index.json');
  });
});
