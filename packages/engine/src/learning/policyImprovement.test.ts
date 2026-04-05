import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildAndWritePolicyImprovementArtifact,
  buildPolicyImprovementArtifact,
  POLICY_IMPROVEMENT_RELATIVE_PATH
} from './policyImprovement.js';

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-policy-improvement-'));

const writeJson = (repo: string, relativePath: string, value: unknown): void => {
  const target = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const seedCanonicalArtifacts = (repo: string): void => {
  writeJson(repo, '.playbook/outcome-feedback.json', {
    schemaVersion: '1.0',
    kind: 'playbook-outcome-feedback',
    generatedAt: '2026-04-05T00:00:00.000Z',
    outcomes: [
      {
        outcomeClass: 'bounded-failure',
        sourceRef: 'runs/r1',
        candidateSignals: {
          confidenceUpdate: { direction: 'down', magnitude: 0.2 },
          trendUpdates: ['failure trend']
        },
        provenanceRefs: ['.playbook/test-autofix-history.json#runs/r1']
      },
      {
        outcomeClass: 'success',
        sourceRef: 'runs/r2',
        candidateSignals: {
          confidenceUpdate: { direction: 'up', magnitude: 0.1 },
          trendUpdates: ['success trend']
        },
        provenanceRefs: ['.playbook/test-autofix-history.json#runs/r2']
      }
    ]
  });

  writeJson(repo, '.playbook/learning-state.json', {
    schemaVersion: '1.0',
    kind: 'learning-state-snapshot',
    generatedAt: '2026-04-05T00:01:00.000Z',
    confidenceSummary: { overall_confidence: 0.62 }
  });

  writeJson(repo, '.playbook/learning-clusters.json', {
    schemaVersion: '1.0',
    kind: 'learning-clusters',
    generatedAt: '2026-04-05T00:02:00.000Z',
    clusters: [
      {
        clusterId: 'cluster:repeated_failure_shape:sig-a',
        dimension: 'repeated_failure_shape',
        confidence: 0.8,
        repeatedSignalSummary: 'sig-a repeats',
        sourceEvidenceRefs: ['.playbook/remediation-status.json#telemetry/blocked_signature_rollup/sig-a']
      }
    ]
  });

  writeJson(repo, '.playbook/graph-informed-learning.json', {
    schemaVersion: '1.0',
    kind: 'graph-informed-learning',
    generatedAt: '2026-04-05T00:03:00.000Z',
    clusters: [
      {
        clusterId: 'cluster:repeated_failure_shape:sig-a',
        relatedModules: ['engine'],
        structuralConcentration: {
          classification: 'concentrated',
          governanceCoverageRatio: 0.7
        }
      }
    ]
  });

  writeJson(repo, '.playbook/policy-evaluation.json', {
    schemaVersion: '1.0',
    kind: 'policy-evaluation',
    generatedAt: '2026-04-05T00:04:00.000Z',
    evaluations: [
      { proposal_id: 'p1', decision: 'blocked', reason: 'repeat failure signature' },
      { proposal_id: 'p2', decision: 'requires_review', reason: 'insufficient evidence' },
      { proposal_id: 'p3', decision: 'safe', reason: 'strong evidence' }
    ]
  });

  writeJson(repo, '.playbook/remediation-status.json', {
    schemaVersion: '1.0',
    kind: 'remediation-status',
    generatedAt: '2026-04-05T00:05:00.000Z',
    blocked_signatures: ['sig-a'],
    review_required_signatures: ['sig-a'],
    telemetry: {
      blocked_signature_rollup: [{ failure_signature: 'sig-a', blocked_count: 3 }],
      repeat_policy_block_counts: [{ decision: 'blocked_repeat_failure', count: 2 }]
    }
  });

  writeJson(repo, '.playbook/test-autofix-history.json', {
    schemaVersion: '1.0',
    kind: 'test-autofix-remediation-history',
    generatedAt: '2026-04-05T00:06:00.000Z',
    runs: [
      { final_status: 'not_fixed' },
      { final_status: 'fixed' }
    ]
  });

  writeJson(repo, '.playbook/pr-review.json', {
    schemaVersion: '1.0',
    kind: 'pr-review',
    generatedAt: '2026-04-05T00:07:00.000Z',
    summary: { findings_count: 4, requires_review_count: 2 }
  });
};

describe('policy-improvement artifact', () => {
  it('is deterministic for the same canonical inputs', () => {
    const repo = createRepo();
    seedCanonicalArtifacts(repo);

    const first = buildPolicyImprovementArtifact(repo);
    const second = buildPolicyImprovementArtifact(repo);

    expect(second).toEqual(first);
    expect(first.kind).toBe('policy-improvement');
  });

  it('remains candidate-only and preserves read-only authority boundaries', () => {
    const repo = createRepo();
    seedCanonicalArtifacts(repo);

    const artifact = buildPolicyImprovementArtifact(repo);

    expect(artifact.proposalOnly).toBe(true);
    expect(artifact.reviewOnly).toBe(true);
    expect(artifact.authority).toEqual({
      mutation: 'read-only',
      promotion: 'review-required',
      ruleMutation: 'forbidden'
    });
    expect(artifact.reviewRequiredFlags.noExecutionSideEffects).toBe(true);
    expect(artifact.reviewRequiredFlags.noDirectPolicyMutation).toBe(true);
    expect(artifact.candidateRankingAdjustments.length).toBeGreaterThan(0);
    expect(artifact.prioritizationImprovementSuggestions.length).toBeGreaterThan(0);
    expect(artifact.repeatedBlockerInfluence.length).toBeGreaterThan(0);
    expect(artifact.confidenceTrendNotes.length).toBeGreaterThan(0);
  });

  it('writes .playbook/policy-improvement.json deterministically', () => {
    const repo = createRepo();
    seedCanonicalArtifacts(repo);

    const written = buildAndWritePolicyImprovementArtifact(repo);
    const absolutePath = path.join(repo, POLICY_IMPROVEMENT_RELATIVE_PATH);
    const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as { kind: string; proposalOnly: boolean; reviewOnly: boolean };

    expect(written.artifactPath).toBe(path.resolve(repo, POLICY_IMPROVEMENT_RELATIVE_PATH));
    expect(parsed.kind).toBe('policy-improvement');
    expect(parsed.proposalOnly).toBe(true);
    expect(parsed.reviewOnly).toBe(true);
  });
});
