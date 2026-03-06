import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const cliEntry = path.join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
const snapshotDir = path.join(repoRoot, 'tests', 'contracts');
const shouldUpdateSnapshots = process.env.UPDATE_CONTRACT_SNAPSHOTS === '1';

const commandContracts = [
  { file: 'rules.snapshot.json', args: ['rules', '--json'] },
  { file: 'index.snapshot.json', args: ['index', '--json'] },
  { file: 'explain-PB001.snapshot.json', args: ['explain', 'PB001', '--json'] },
  { file: 'explain-architecture.snapshot.json', args: ['explain', 'architecture', '--json'] },
  { file: 'verify.snapshot.json', args: ['verify', '--json'] },
  { file: 'plan.snapshot.json', args: ['plan', '--json'] }
] as const;

function createContractFixtureRepo(): string {
  const fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-contract-fixture-'));

  fs.writeFileSync(path.join(fixtureRepo, 'package.json'), JSON.stringify({ name: 'playbook-contract-fixture' }, null, 2));
  fs.mkdirSync(path.join(fixtureRepo, 'src', 'features'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRepo, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(fixtureRepo, 'docs', 'PLAYBOOK_NOTES.md'), '# Playbook Notes\n\n- Baseline fixture notes.\n');

  return fixtureRepo;
}

function normalizeContractPayload(value: unknown, fixtureRepo: string): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeContractPayload(entry, fixtureRepo));
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};

    for (const [key, raw] of Object.entries(objectValue)) {
      if (key === 'timestamp' || key === 'generatedAt' || key === 'cwd' || key === 'repoRoot') {
        continue;
      }

      normalized[key] = normalizeContractPayload(raw, fixtureRepo);
    }

    return normalized;
  }

  if (typeof value === 'string') {
    return value
      .replaceAll('\\', '/')
      .replaceAll(fixtureRepo.replaceAll('\\', '/'), '<CONTRACT_FIXTURE_REPO>')
      .replaceAll(repoRoot.replaceAll('\\', '/'), '<REPO_ROOT>');
  }

  return value;
}

function runCliJsonContract(args: readonly string[], fixtureRepo: string): unknown {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: fixtureRepo,
    encoding: 'utf8'
  });

  const stdout = result.stdout.trim();
  expect(stdout, `Command emitted no stdout for: ${args.join(' ')}\n${result.stderr}`).not.toBe('');

  const jsonStart = stdout.indexOf('{');
  const jsonEnd = stdout.lastIndexOf('}');

  expect(jsonStart, `No JSON payload was emitted for: ${args.join(' ')}`).toBeGreaterThanOrEqual(0);
  expect(jsonEnd, `No JSON payload was emitted for: ${args.join(' ')}`).toBeGreaterThanOrEqual(jsonStart);

  const payload = stdout.slice(jsonStart, jsonEnd + 1);

  return normalizeContractPayload(JSON.parse(payload), fixtureRepo);
}

describe('CLI JSON contract snapshots', () => {
  it('matches committed snapshots for stable automation contracts', () => {
    fs.mkdirSync(snapshotDir, { recursive: true });
    const fixtureRepo = createContractFixtureRepo();

    try {
      for (const contract of commandContracts) {
        const snapshotPath = path.join(snapshotDir, contract.file);
        const actualPayload = runCliJsonContract(contract.args, fixtureRepo);
        const actualJson = `${JSON.stringify(actualPayload, null, 2)}\n`;

        if (shouldUpdateSnapshots || !fs.existsSync(snapshotPath)) {
          fs.writeFileSync(snapshotPath, actualJson, 'utf8');
        }

        const expectedJson = fs.readFileSync(snapshotPath, 'utf8');
        expect(actualJson).toBe(expectedJson);
      }
    } finally {
      fs.rmSync(fixtureRepo, { recursive: true, force: true });
    }
  });
});
