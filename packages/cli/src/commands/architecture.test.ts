import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { listRegisteredCommands } from './index.js';
import { runArchitecture } from './architecture.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

const writeRegistry = (repo: string): void => {
  const registryPath = path.join(repo, '.playbook', 'architecture', 'subsystems.json');
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(
    registryPath,
    JSON.stringify(
      {
        version: 1,
        subsystems: [
          {
            name: 'bootstrap_contract_surface',
            purpose: 'Machine-readable interface for humans and agents',
            commands: ['context'],
            artifacts: ['.playbook/ai-contract.json']
          }
        ]
      },
      null,
      2
    )
  );
};

describe('runArchitecture', () => {
  it('prints architecture verification payload as json', async () => {
    const repo = createRepo('playbook-architecture-verify');
    writeRegistry(repo);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runArchitecture(repo, ['verify'], { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(payload.command).toBe('architecture');
    expect(payload.subcommand).toBe('verify');
    expect(payload.valid).toBe(true);

    logSpy.mockRestore();
  });
});

describe('command registry', () => {
  it('registers the architecture command', () => {
    const command = listRegisteredCommands().find((entry) => entry.name === 'architecture');

    expect(command).toBeDefined();
    expect(command?.description).toBe('Verify subsystem registry ownership and architecture mapping integrity');
  });
});
