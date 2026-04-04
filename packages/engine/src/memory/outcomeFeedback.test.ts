import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOutcomeFeedbackArtifact, buildAndWriteOutcomeFeedbackArtifact } from './outcomeFeedback.js';

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-outcome-feedback-'));
const writeJson = (repoRoot: string, relativePath: string, payload: unknown): void => {
  const absolute = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

describe('outcome feedback artifact', () => {
  it('is deterministic for identical source artifacts and remains candidate-only', () => {
    const repoRoot = createRepo();
    writeJson(repoRoot, '.playbook/execution-receipt.json', {
      schemaVersion: '1.0',
      kind: 'fleet-adoption-execution-receipt',
      generated_at: '2026-03-20T00:00:00.000Z',
      prompt_results: [
        {
          prompt_id: 'prompt-success',
          status: 'success',
          verification_passed: true,
          notes: 'verified transition completed',
          evidence: ['evidence:success']
        },
        {
          prompt_id: 'prompt-rollback',
          status: 'failed',
          verification_passed: false,
          notes: 'rollback executed after drift',
          evidence: ['evidence:rollback']
        }
      ]
    });

    writeJson(repoRoot, '.playbook/interop-updated-truth.json', {
      schemaVersion: '1.0',
      kind: 'interop-updated-truth-artifact',
      updates: [
        {
          receiptId: 'interop-1',
          requestId: 'request-1',
          canonicalOutcomeSummary: {
            outcome: 'blocked',
            detail: 'policy gate requires review',
            completedAt: '2026-03-20T01:00:00.000Z'
          }
        }
      ]
    });

    writeJson(repoRoot, '.playbook/interop-followups.json', {
      schemaVersion: '1.0',
      kind: 'interop-followups-artifact',
      followups: [
        {
          followupId: 'followup-1',
          followupType: 'review-cue',
          nextActionText: 'policy assumption shifted',
          reviewQueueEntry: { triggerReasonCode: 'interop-policy-assumption-shift' }
        }
      ]
    });

    writeJson(repoRoot, '.playbook/remediation-status.json', {
      schemaVersion: '1.0',
      kind: 'remediation-status',
      generatedAt: '2026-03-20T02:00:00.000Z',
      latest_result: {
        final_status: 'blocked_low_confidence'
      }
    });

    writeJson(repoRoot, '.playbook/test-autofix-history.json', {
      schemaVersion: '1.0',
      kind: 'test-autofix-remediation-history',
      runs: [
        {
          run_id: 'run-1',
          generatedAt: '2026-03-20T03:00:00.000Z',
          final_status: 'fixed',
          failure_signatures: ['signature-1']
        },
        {
          run_id: 'run-2',
          generatedAt: '2026-03-21T03:00:00.000Z',
          final_status: 'not_fixed',
          failure_signatures: ['signature-1']
        }
      ]
    });

    const first = buildOutcomeFeedbackArtifact(repoRoot);
    const second = buildOutcomeFeedbackArtifact(repoRoot);

    expect(second).toEqual(first);
    expect(first.governance).toEqual({
      candidateOnly: true,
      autoPromotion: false,
      autoMutation: false,
      reviewRequired: true
    });
    expect(first.outcomes.every((entry) => entry.candidateOnly)).toBe(true);

    const written = buildAndWriteOutcomeFeedbackArtifact(repoRoot);
    expect(written.artifactPath).toBe('.playbook/outcome-feedback.json');
    expect(fs.existsSync(path.join(repoRoot, written.artifactPath))).toBe(true);
  });

  it('preserves rollback/deactivation as a first-class outcome class', () => {
    const repoRoot = createRepo();
    writeJson(repoRoot, '.playbook/execution-receipt.json', {
      schemaVersion: '1.0',
      kind: 'fleet-adoption-execution-receipt',
      generated_at: '2026-03-22T00:00:00.000Z',
      prompt_results: [
        {
          prompt_id: 'prompt-rb',
          status: 'failed',
          verification_passed: false,
          notes: 'deactivation initiated due to rollback policy',
          evidence: []
        }
      ]
    });

    const artifact = buildOutcomeFeedbackArtifact(repoRoot);
    expect(artifact.outcomeCounts['rollback-deactivation']).toBeGreaterThan(0);
    expect(artifact.outcomes.some((entry) => entry.outcomeClass === 'rollback-deactivation')).toBe(true);
  });
});
