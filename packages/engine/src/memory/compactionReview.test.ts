import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMemoryCompactionReviewArtifact } from './compactionReview.js';

const makeRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-memory-compaction-'));

const writeJson = (repoRoot: string, relativePath: string, payload: unknown): void => {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

describe('memory compaction review', () => {
  it('is deterministic for the same evidence and preserves provenance through replay and consolidation', () => {
    const repoRoot = makeRepo();

    writeJson(repoRoot, '.playbook/memory/replay-candidates.json', {
      schemaVersion: '1.0',
      kind: 'playbook-replay-candidates',
      command: 'memory-replay',
      sourceIndex: '.playbook/memory/index.json',
      generatedAt: '1970-01-01T00:00:00.000Z',
      candidateOnly: true,
      authority: { mutation: 'read-only', promotion: 'review-required' },
      totalEvents: 4,
      clustersEvaluated: 4,
      replayEvidence: {
        schemaVersion: '1.0',
        kind: 'playbook-session-replay-evidence',
        generatedAt: '1970-01-01T00:00:00.000Z',
        memoryIndex: { path: '.playbook/memory/index.json', eventCount: 4 },
        replayInputs: [],
        authority: { mutation: 'read-only', promotion: 'review-required' }
      },
      candidates: [
        {
          candidateId: 'cand-discard', kind: 'open_question', title: 'Discard me', summary: 'open question', clusterKey: 'fp-discard', salienceScore: 2,
          salienceFactors: { severity: 1, recurrenceCount: 1, blastRadius: 1, crossModuleSpread: 1, ownershipDocsGap: 1, novelSuccessfulRemediationSignal: 0 },
          fingerprint: 'fp-discard', module: 'packages/engine', ruleId: 'rule.discard', failureShape: 'fp-discard', eventCount: 1,
          provenance: [{ eventId: 'evt-discard', sourcePath: '.playbook/memory/events/evt-discard.json', fingerprint: 'fp-discard', runId: 'run-1' }],
          lastSeenAt: '2026-03-23T00:00:00.000Z', supersession: { evolutionOrdinal: 1, priorCandidateIds: [], supersedesCandidateIds: [] }
        },
        {
          candidateId: 'cand-attach', kind: 'decision', title: 'Attach me', summary: 'already promoted', clusterKey: 'fp-attach', salienceScore: 5,
          salienceFactors: { severity: 2, recurrenceCount: 2, blastRadius: 2, crossModuleSpread: 1, ownershipDocsGap: 0, novelSuccessfulRemediationSignal: 0 },
          fingerprint: 'fp-attach', module: 'packages/cli', ruleId: 'rule.attach', failureShape: 'fp-attach', eventCount: 1,
          provenance: [{ eventId: 'evt-attach', sourcePath: '.playbook/memory/events/evt-attach.json', fingerprint: 'fp-attach', runId: 'run-2' }],
          lastSeenAt: '2026-03-23T01:00:00.000Z', supersession: { evolutionOrdinal: 1, priorCandidateIds: [], supersedesCandidateIds: [] }
        },
        {
          candidateId: 'cand-merge', kind: 'failure_mode', title: 'Merge me', summary: 'supersedes prior lineage', clusterKey: 'fp-merge', salienceScore: 7,
          salienceFactors: { severity: 6, recurrenceCount: 3, blastRadius: 4, crossModuleSpread: 2, ownershipDocsGap: 0, novelSuccessfulRemediationSignal: 0 },
          fingerprint: 'fp-merge', module: 'packages/contracts', ruleId: 'rule.merge', failureShape: 'fp-merge', eventCount: 1,
          provenance: [{ eventId: 'evt-merge', sourcePath: '.playbook/memory/events/evt-merge.json', fingerprint: 'fp-merge', runId: 'run-3' }],
          lastSeenAt: '2026-03-23T02:00:00.000Z', supersession: { evolutionOrdinal: 2, priorCandidateIds: ['cand-merge-prior'], supersedesCandidateIds: ['cand-merge-prior'] }
        },
        {
          candidateId: 'cand-new', kind: 'pattern', title: 'Promote me later', summary: 'net new candidate', clusterKey: 'fp-new', salienceScore: 9,
          salienceFactors: { severity: 3, recurrenceCount: 4, blastRadius: 3, crossModuleSpread: 2, ownershipDocsGap: 0, novelSuccessfulRemediationSignal: 1 },
          fingerprint: 'fp-new', module: 'packages/engine', ruleId: 'rule.new', failureShape: 'fp-new', eventCount: 1,
          provenance: [{ eventId: 'evt-new', sourcePath: '.playbook/memory/events/evt-new.json', fingerprint: 'fp-new', runId: 'run-4' }],
          lastSeenAt: '2026-03-23T03:00:00.000Z', supersession: { evolutionOrdinal: 1, priorCandidateIds: [], supersedesCandidateIds: [] }
        }
      ]
    });

    writeJson(repoRoot, '.playbook/memory/knowledge/decisions.json', {
      schemaVersion: '1.0',
      artifact: 'memory-knowledge',
      kind: 'decision',
      generatedAt: '1970-01-01T00:00:00.000Z',
      entries: [
        {
          knowledgeId: 'decision-attach', candidateId: 'cand-attach', sourceCandidateIds: ['cand-attach'], sourceEventFingerprints: ['fp-attach'],
          kind: 'decision', title: 'Attach me', summary: 'existing knowledge', fingerprint: 'fp-attach', module: 'packages/cli', ruleId: 'rule.attach', failureShape: 'fp-attach',
          promotedAt: '2026-03-23T04:00:00.000Z', provenance: [{ eventId: 'evt-attach', sourcePath: '.playbook/memory/events/evt-attach.json', fingerprint: 'fp-attach', runId: 'run-2' }],
          status: 'active', supersedes: [], supersededBy: []
        }
      ]
    });

    const first = buildMemoryCompactionReviewArtifact(repoRoot);
    const second = buildMemoryCompactionReviewArtifact(repoRoot);

    expect(second).toEqual(first);
    expect(first.authority).toEqual({ mutation: 'read-only', promotion: 'review-required' });
    expect(first.summary).toEqual({ totalEntries: 4, discard: 1, attach: 1, merge: 1, newCandidate: 1, explicitPromotionRequired: 4 });
    expect(first.entries.map((entry) => entry.decision.decision).sort()).toEqual(['attach', 'discard', 'merge', 'new_candidate']);

    const attach = first.entries.find((entry) => entry.replayCandidateId === 'cand-attach');
    expect(attach?.decision.reasonCodes).toContain('knowledge_fingerprint_match');
    expect(attach?.provenance.promotedKnowledge[0]).toMatchObject({ knowledgeId: 'decision-attach', sourceCandidateIds: ['cand-attach'] });
    expect(attach?.provenance.events[0]).toMatchObject({ eventId: 'evt-attach', sourcePath: '.playbook/memory/events/evt-attach.json' });

    const merge = first.entries.find((entry) => entry.replayCandidateId === 'cand-merge');
    expect(merge?.decision).toMatchObject({ decision: 'merge', reasonCodes: ['replay_lineage_merge'] });

    const discard = first.entries.find((entry) => entry.replayCandidateId === 'cand-discard');
    expect(discard?.decision).toMatchObject({ decision: 'discard', reasonCodes: ['promotion_ineligible_open_question'] });
  });
});
