import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveContextSnapshotCache } from './contextSnapshotCache.js';

const repos: string[] = [];

const createRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'context-cache-'));
  repos.push(repo);
  fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.playbook', 'repo-index.json'), JSON.stringify({ schemaVersion: '1.0', modules: [] }, null, 2));
  fs.writeFileSync(path.join(repo, '.playbook', 'repo-graph.json'), JSON.stringify({ schemaVersion: '1.0', nodes: [], edges: [] }, null, 2));
  fs.writeFileSync(path.join(repo, '.playbook', 'module-digests.json'), JSON.stringify({ schemaVersion: '1.0', kind: 'playbook-module-digests', modules: [] }, null, 2));
  fs.writeFileSync(path.join(repo, '.playbook', 'runtime-manifests.json'), JSON.stringify({ schemaVersion: '1.0', kind: 'runtime-manifests', manifests: [] }, null, 2));
  return repo;
};

afterEach(() => {
  while (repos.length > 0) {
    const repo = repos.pop();
    if (repo) fs.rmSync(repo, { recursive: true, force: true });
  }
});

describe('resolveContextSnapshotCache', () => {
  it('reuses cache when source fingerprints are unchanged', () => {
    const repo = createRepo();
    const first = resolveContextSnapshotCache({
      projectRoot: repo,
      scope: { kind: 'repo', id: 'root' },
      shapingLevel: 'context',
      riskTier: 'context',
      sourceArtifacts: ['.playbook/repo-index.json', '.playbook/repo-graph.json', '.playbook/module-digests.json', '.playbook/runtime-manifests.json'],
      buildSnapshot: () => ({ message: 'first' })
    });

    const second = resolveContextSnapshotCache({
      projectRoot: repo,
      scope: { kind: 'repo', id: 'root' },
      shapingLevel: 'context',
      riskTier: 'context',
      sourceArtifacts: ['.playbook/repo-index.json', '.playbook/repo-graph.json', '.playbook/module-digests.json', '.playbook/runtime-manifests.json'],
      buildSnapshot: () => ({ message: 'second' })
    });

    expect(first.cache.reused).toBe(false);
    expect(first.cache.invalidationReason).toBe('cache-miss');
    expect(second.cache.reused).toBe(true);
    expect(second.cache.invalidationReason).toBe('none');
    expect(second.snapshot).toEqual({ message: 'first' });
  });

  it('invalidates cache when source fingerprints drift', () => {
    const repo = createRepo();
    resolveContextSnapshotCache({
      projectRoot: repo,
      scope: { kind: 'repo', id: 'root' },
      shapingLevel: 'context',
      riskTier: 'context',
      sourceArtifacts: ['.playbook/repo-index.json', '.playbook/repo-graph.json', '.playbook/module-digests.json', '.playbook/runtime-manifests.json'],
      buildSnapshot: () => ({ message: 'before-change' })
    });

    fs.writeFileSync(path.join(repo, '.playbook', 'repo-index.json'), JSON.stringify({ schemaVersion: '1.0', modules: [{ name: 'api' }] }, null, 2));

    const after = resolveContextSnapshotCache({
      projectRoot: repo,
      scope: { kind: 'repo', id: 'root' },
      shapingLevel: 'context',
      riskTier: 'context',
      sourceArtifacts: ['.playbook/repo-index.json', '.playbook/repo-graph.json', '.playbook/module-digests.json', '.playbook/runtime-manifests.json'],
      buildSnapshot: () => ({ message: 'after-change' })
    });

    expect(after.cache.reused).toBe(false);
    expect(after.cache.invalidationReason).toBe('source-fingerprint-drift');
    expect(after.snapshot).toEqual({ message: 'after-change' });
  });

  it('uses separate cache entries for different shaping scopes', () => {
    const repo = createRepo();

    const repoScoped = resolveContextSnapshotCache({
      projectRoot: repo,
      scope: { kind: 'repo', id: 'root' },
      shapingLevel: 'ask-context',
      riskTier: 'repo',
      sourceArtifacts: ['.playbook/repo-index.json', '.playbook/repo-graph.json', '.playbook/module-digests.json', '.playbook/runtime-manifests.json'],
      buildSnapshot: () => ({ scope: 'repo' })
    });

    const moduleScoped = resolveContextSnapshotCache({
      projectRoot: repo,
      scope: { kind: 'module', id: 'workouts' },
      shapingLevel: 'ask-context',
      riskTier: 'module',
      sourceArtifacts: ['.playbook/repo-index.json', '.playbook/repo-graph.json', '.playbook/module-digests.json', '.playbook/runtime-manifests.json'],
      buildSnapshot: () => ({ scope: 'module' })
    });

    expect(repoScoped.cache.cacheKey).not.toBe(moduleScoped.cache.cacheKey);
    expect(repoScoped.cache.snapshotPath).not.toBe(moduleScoped.cache.snapshotPath);
  });
});
