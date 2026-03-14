import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeCrossRepoPatternLearning } from '../src/scoring/crossRepoPatternLearning.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

const writeFixtureArtifacts = (repo: string): void => {
  const graphSource = path.join(process.cwd(), '..', '..', 'tests', 'contracts', 'pattern-graph.fixture.json');
  const outcomesSource = path.join(process.cwd(), '..', '..', 'tests', 'contracts', 'pattern-outcomes.fixture.json');
  const graphTarget = path.join(repo, '.playbook', 'pattern-graph.json');
  const outcomesTarget = path.join(repo, '.playbook', 'pattern-outcomes.json');
  fs.mkdirSync(path.dirname(graphTarget), { recursive: true });
  fs.copyFileSync(graphSource, graphTarget);
  fs.copyFileSync(outcomesSource, outcomesTarget);
};

describe('crossRepoPatternLearning', () => {
  it('aggregates per-pattern signals across repositories', () => {
    const repoA = createRepo('playbook-cross-repo-a');
    const repoB = createRepo('playbook-cross-repo-b');
    writeFixtureArtifacts(repoA);
    writeFixtureArtifacts(repoB);

    const artifact = computeCrossRepoPatternLearning([
      { id: 'repo-a', repoPath: repoA },
      { id: 'repo-b', repoPath: repoB }
    ]);

    expect(artifact.kind).toBe('cross-repo-patterns');
    expect(artifact.repositories).toHaveLength(2);
    expect(artifact.aggregates.length).toBeGreaterThan(0);
    expect(artifact.aggregates[0]).toHaveProperty('portability_score');
  });
});
