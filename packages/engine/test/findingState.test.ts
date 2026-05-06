import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readJsonArtifact } from '../src/artifacts/artifactIO.js';
import { buildVerifyFindingObservations, deriveVerifyFindingState } from '../src/verification/findingState.js';

describe('verify finding state', () => {
  it('tracks stable identities and triage transitions across verify runs', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-finding-state-'));
    const baselineRef = 'main';
    const report = {
      failures: [
        {
          id: 'release.version-governance',
          message: 'missing version bump',
          evidence: 'packages/app/package.json'
        }
      ],
      warnings: []
    };

    const first = deriveVerifyFindingState(repoRoot, {
      baselineRef,
      findings: buildVerifyFindingObservations(report),
      generatedAt: '2026-05-04T00:00:00.000Z'
    });
    expect(first.summary).toEqual({ total: 1, new: 1, existing: 0, resolved: 0, ignored: 0 });
    expect(first.findings).toHaveLength(1);
    expect(first.findings[0]).toMatchObject({
      ruleId: 'release.version-governance',
      normalizedLocation: 'packages/app/package.json',
      state: 'new',
      firstSeenAt: '2026-05-04T00:00:00.000Z',
      lastSeenAt: '2026-05-04T00:00:00.000Z'
    });

    const second = deriveVerifyFindingState(repoRoot, {
      baselineRef,
      findings: buildVerifyFindingObservations(report),
      generatedAt: '2026-05-04T01:00:00.000Z'
    });
    expect(second.summary).toEqual({ total: 1, new: 0, existing: 1, resolved: 0, ignored: 0 });
    expect(second.findings).toHaveLength(1);
    expect(second.findings[0]).toMatchObject({
      findingId: first.findings[0].findingId,
      state: 'existing',
      firstSeenAt: '2026-05-04T00:00:00.000Z',
      lastSeenAt: '2026-05-04T01:00:00.000Z'
    });

    const third = deriveVerifyFindingState(repoRoot, {
      baselineRef,
      findings: [],
      generatedAt: '2026-05-04T02:00:00.000Z'
    });
    expect(third.summary).toEqual({ total: 1, new: 0, existing: 0, resolved: 1, ignored: 0 });
    expect(third.findings).toHaveLength(0);
    expect(third.resolved).toHaveLength(1);
    expect(third.resolved[0]).toMatchObject({
      findingId: first.findings[0].findingId,
      state: 'resolved',
      firstSeenAt: '2026-05-04T00:00:00.000Z',
      lastSeenAt: '2026-05-04T02:00:00.000Z'
    });

    const artifact = readJsonArtifact<{ summary: { resolved: number } }>(path.join(repoRoot, '.playbook/finding-state.json'));
    expect(artifact.summary.resolved).toBe(1);
  });
});
