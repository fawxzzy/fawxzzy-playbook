import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readControlPlaneState, writeControlPlaneState, CONTROL_PLANE_STATE_RELATIVE_PATH } from './controlPlaneState.js';

const writeJson = (repo: string, relativePath: string, value: unknown): void => {
  const absolutePath = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-control-plane-'));

describe('controlPlaneState', () => {
  it('is deterministic for the same source artifacts', () => {
    const repo = createRepo();
    writeJson(repo, '.playbook/session.json', {
      version: 1,
      sessionId: 'session-1',
      pinnedArtifacts: [],
      evidenceEnvelope: {
        policy_decisions: [{ proposal_id: 'p-1', decision: 'requires_review' }],
        proposal_ids: ['p-1']
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

    const first = readControlPlaneState(repo);
    const second = readControlPlaneState(repo);

    expect(second).toEqual(first);
    expect(first.generatedAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('fails closed when required evidence is missing', () => {
    const repo = createRepo();

    const state = writeControlPlaneState(repo);

    expect(state.active_execution_mode).toBe('read-runtime-inspection');
    expect(state.mutation_scope_level).toBe('none');
    expect(state.stale_or_invalid_state).toContain('session_invalid_or_missing');
    expect(state.stale_or_invalid_state).toContain('evidence_envelope_missing_or_invalid');
    expect(fs.existsSync(path.join(repo, CONTROL_PLANE_STATE_RELATIVE_PATH))).toBe(true);
  });
});
