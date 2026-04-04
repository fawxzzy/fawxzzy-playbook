import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LONGITUDINAL_STATE_RELATIVE_PATH, readLongitudinalState, writeLongitudinalState } from './longitudinalState.js';

const writeJson = (repo: string, relativePath: string, value: unknown): void => {
  const absolutePath = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-longitudinal-state-'));

describe('longitudinalState', () => {
  it('is deterministic for the same source artifacts', () => {
    const repo = createRepo();

    writeJson(repo, '.playbook/session.json', {
      version: 1,
      sessionId: 'session-1',
      lastUpdatedTime: '2026-01-01T00:00:00.000Z',
      pinnedArtifacts: [{ artifact: '.playbook/verify.json', pinnedAt: '2026-01-01T00:00:01.000Z' }],
      evidenceEnvelope: {
        policy_decisions: [{ proposal_id: 'proposal-1', decision: 'requires_review' }]
      }
    });

    writeJson(repo, '.playbook/execution-runs/pb-exec-1.json', {
      schemaVersion: '1.0',
      kind: 'orchestration-execution-run-state',
      run_id: 'pb-exec-1',
      source_launch_plan_fingerprint: 'abc',
      eligible_lanes: ['lane-1'],
      status: 'completed',
      lanes: {
        'lane-1': {
          lane_id: 'lane-1',
          status: 'completed',
          blocker_refs: [],
          receipt_refs: ['receipt:1'],
          worker_id: 'worker-1',
          started_at: '2026-01-01T00:00:00.000Z',
          completed_at: '2026-01-01T00:01:00.000Z',
          updated_at: '2026-01-01T00:01:00.000Z'
        }
      },
      metadata: { runtime: 'execution-supervisor', resumed_from_interrupted_run: false, reconcile_revision: 1 },
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:01:00.000Z',
      completed_at: '2026-01-01T00:01:00.000Z'
    });

    const first = readLongitudinalState(repo);
    const second = readLongitudinalState(repo);

    expect(second).toEqual(first);
    expect(first.generatedAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('degrades gracefully when optional source artifacts are missing', () => {
    const repo = createRepo();
    writeJson(repo, '.playbook/session.json', {
      version: 1,
      sessionId: 'session-2',
      lastUpdatedTime: '2026-02-01T00:00:00.000Z',
      pinnedArtifacts: [],
      evidenceEnvelope: { policy_decisions: [] }
    });

    const artifact = writeLongitudinalState(repo);

    expect(artifact.kind).toBe('playbook-longitudinal-state');
    expect(artifact.recurring_evidence.failure_clusters).toEqual([]);
    expect(artifact.verification_outcomes.verify.present).toBe(false);
    expect(fs.existsSync(path.join(repo, LONGITUDINAL_STATE_RELATIVE_PATH))).toBe(true);
  });

  it('aggregates recurring evidence deterministically', () => {
    const repo = createRepo();
    writeJson(repo, '.playbook/session.json', {
      version: 1,
      sessionId: 'session-3',
      lastUpdatedTime: '2026-03-01T00:00:00.000Z',
      pinnedArtifacts: [],
      evidenceEnvelope: { policy_decisions: [] }
    });

    writeJson(repo, '.playbook/verify.json', {
      ok: false,
      findings: [
        { ruleId: 'rule.alpha', severity: 'high' },
        { ruleId: 'rule.alpha', severity: 'high' },
        { ruleId: 'rule.beta', severity: 'low' }
      ]
    });

    writeJson(repo, '.playbook/test-autofix-history.json', {
      schemaVersion: '1.0',
      kind: 'test-autofix-remediation-history',
      runs: [
        { run_id: 'run-1', generatedAt: '2026-03-01T00:01:00.000Z', failure_signatures: ['sig-a', 'sig-b'] },
        { run_id: 'run-2', generatedAt: '2026-03-01T00:02:00.000Z', failure_signatures: ['sig-a'] }
      ]
    });

    const artifact = readLongitudinalState(repo);

    expect(artifact.recurring_evidence.failure_clusters[0]).toMatchObject({ key: 'sig-a', count: 2 });
    expect(artifact.recurring_evidence.finding_clusters[0]).toMatchObject({ key: 'rule.alpha', count: 2 });
    expect(artifact.unresolved_risks).toContain('rule.alpha');
  });
});
