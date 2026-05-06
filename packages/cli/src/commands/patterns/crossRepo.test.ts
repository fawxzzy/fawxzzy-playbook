import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../../lib/cliContract.js';
import {
  runPatternsCrossRepo,
  runPatternsGeneralized,
  runPatternsPortability,
  runPatternsRepoDelta
} from './crossRepo.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

const writeContractPatternGraph = (repo: string): void => {
  const source = path.join(process.cwd(), '..', '..', '..', 'tests', 'contracts', 'pattern-graph.fixture.json');
  const target = path.join(repo, '.playbook', 'pattern-graph.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
};

const writePatternOutcomes = (repo: string): void => {
  const source = path.join(process.cwd(), '..', '..', '..', 'tests', 'contracts', 'pattern-outcomes.fixture.json');
  const target = path.join(repo, '.playbook', 'pattern-outcomes.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
};

const writeRepoPatternArtifacts = (repo: string): void => {
  writeContractPatternGraph(repo);
  writePatternOutcomes(repo);
};

const writeCrossRepoPatternsArtifact = (repo: string): void => {
  const filePath = path.join(repo, '.playbook', 'cross-repo-patterns.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        schemaVersion: '1.0',
        kind: 'cross-repo-patterns',
        generatedAt: '2026-01-01T00:00:00.000Z',
        repositories: [
          {
            id: 'repo-a',
            repoPath: '/tmp/repo-a',
            patternCount: 2,
            patterns: [
              { pattern_id: 'pattern.modularity', attractor: 0.9, fitness: 0.82, strength: 0.87, instance_count: 3, governance_stable: true },
              { pattern_id: 'pattern.recursion', attractor: 0.7, fitness: 0.62, strength: 0.67, instance_count: 1, governance_stable: false }
            ]
          },
          {
            id: 'repo-b',
            repoPath: '/tmp/repo-b',
            patternCount: 2,
            patterns: [
              { pattern_id: 'pattern.modularity', attractor: 0.88, fitness: 0.8, strength: 0.85, instance_count: 2, governance_stable: true },
              { pattern_id: 'pattern.recursion', attractor: 0.6, fitness: 0.58, strength: 0.59, instance_count: 1, governance_stable: false }
            ]
          }
        ],
        aggregates: [
          {
            pattern_id: 'pattern.modularity',
            repo_count: 2,
            instance_count: 5,
            mean_attractor: 0.89,
            mean_fitness: 0.81,
            portability_score: 0.9,
            outcome_consistency: 0.95,
            instance_diversity: 1,
            governance_stability: 1
          },
          {
            pattern_id: 'pattern.recursion',
            repo_count: 2,
            instance_count: 2,
            mean_attractor: 0.65,
            mean_fitness: 0.6,
            portability_score: 0.58,
            outcome_consistency: 0.84,
            instance_diversity: 0.5,
            governance_stability: 0
          }
        ]
      },
      null,
      2
    )
  );
};

describe('cross-repo pattern commands', () => {
  it('computes cross-repo aggregates and writes the canonical artifact', () => {
    const workspace = createRepo('playbook-cli-patterns-cross-repo-command');
    const repoA = path.join(workspace, 'repo-a');
    const repoB = path.join(workspace, 'repo-b');
    fs.mkdirSync(repoA, { recursive: true });
    fs.mkdirSync(repoB, { recursive: true });
    writeRepoPatternArtifacts(repoA);
    writeRepoPatternArtifacts(repoB);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = runPatternsCrossRepo(
      workspace,
      ['cross-repo', '--repo', './repo-a', '--repo', './repo-b'],
      { format: 'json', quiet: false }
    );

    expect(exitCode).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.action).toBe('cross-repo');
    expect(payload.aggregates.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(workspace, '.playbook', 'cross-repo-patterns.json'))).toBe(true);

    logSpy.mockRestore();
  });

  it('filters portability results by pattern id deterministically', () => {
    const repo = createRepo('playbook-cli-patterns-portability-command');
    writeCrossRepoPatternsArtifact(repo);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = runPatternsPortability(repo, ['portability', '--pattern', 'pattern.modularity'], {
      format: 'json',
      quiet: false
    });

    expect(exitCode).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.action).toBe('portability');
    expect(payload.portability).toEqual([{ pattern_id: 'pattern.modularity', portability_score: 0.9 }]);

    logSpy.mockRestore();
  });

  it('keeps only highly portable generalized patterns', () => {
    const repo = createRepo('playbook-cli-patterns-generalized-command');
    writeCrossRepoPatternsArtifact(repo);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = runPatternsGeneralized(repo, { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.action).toBe('generalized');
    expect(payload.generalized).toHaveLength(1);
    expect(payload.generalized[0].pattern_id).toBe('pattern.modularity');

    logSpy.mockRestore();
  });

  it('computes repo delta for shared cross-repo patterns', () => {
    const repo = createRepo('playbook-cli-patterns-repo-delta-command');
    writeCrossRepoPatternsArtifact(repo);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = runPatternsRepoDelta(repo, ['repo-delta', '--left', 'repo-a', '--right', 'repo-b'], {
      format: 'json',
      quiet: false
    });

    expect(exitCode).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.action).toBe('repo-delta');
    expect(payload.leftRepo).toBe('repo-a');
    expect(payload.rightRepo).toBe('repo-b');
    expect(payload.deltas[0]).toHaveProperty('strength_delta');

    logSpy.mockRestore();
  });
});
