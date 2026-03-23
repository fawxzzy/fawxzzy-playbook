import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { MemoryReplayCandidate } from '../schema/memoryReplay.js';
import type { MemoryKnowledgeArtifact, MemoryKnowledgeEntry } from './knowledge.js';
import {
  buildConsolidationCandidatesArtifact,
  CONSOLIDATION_CANDIDATES_RELATIVE_PATH,
  type ConsolidationCandidate
} from '../consolidation/candidates.js';

export const MEMORY_COMPACTION_REVIEW_RELATIVE_PATH = '.playbook/memory/compaction-review.json' as const;

const KNOWLEDGE_PATHS = [
  '.playbook/memory/knowledge/decisions.json',
  '.playbook/memory/knowledge/patterns.json',
  '.playbook/memory/knowledge/failure-modes.json',
  '.playbook/memory/knowledge/invariants.json'
] as const;

export type MemoryCompactionBucketDecision = 'discard' | 'attach' | 'merge' | 'new_candidate';

export type MemoryCompactionReasonCode =
  | 'promotion_ineligible_open_question'
  | 'promotion_ineligible_review_only'
  | 'knowledge_fingerprint_match'
  | 'knowledge_lineage_attach'
  | 'replay_lineage_merge'
  | 'consolidated_replay_merge'
  | 'novel_candidate_required';

export type MemoryCompactionDecisionRecord = {
  decision: MemoryCompactionBucketDecision;
  reasonCodes: MemoryCompactionReasonCode[];
  rationale: string;
};

export type MemoryCompactionReviewEntry = {
  reviewId: string;
  consolidationCandidateId: string;
  replayCandidateId: string;
  kind: MemoryReplayCandidate['kind'];
  title: string;
  module: string;
  ruleId: string;
  fingerprint: string;
  decision: MemoryCompactionDecisionRecord;
  promotion: {
    explicitOnly: true;
    eligible: boolean;
    reviewRequired: true;
    matchedKnowledgeIds: string[];
  };
  salience: ConsolidationCandidate['salience'];
  provenance: {
    replayCandidates: ConsolidationCandidate['provenance']['replayCandidates'];
    events: ConsolidationCandidate['provenance']['events'];
    promotedKnowledge: Array<{
      knowledgeId: string;
      kind: string;
      status: string;
      fingerprint: string;
      sourceCandidateIds: string[];
      sourceEventFingerprints: string[];
    }>;
  };
};

export type MemoryCompactionReviewArtifact = {
  schemaVersion: '1.0';
  kind: 'playbook-memory-compaction-review';
  command: 'memory-compaction-review';
  generatedAt: string;
  reviewOnly: true;
  authority: {
    mutation: 'read-only';
    promotion: 'review-required';
  };
  sourceArtifacts: {
    consolidationCandidates: typeof CONSOLIDATION_CANDIDATES_RELATIVE_PATH;
    promotedKnowledge: string[];
  };
  summary: {
    totalEntries: number;
    discard: number;
    attach: number;
    merge: number;
    newCandidate: number;
    explicitPromotionRequired: number;
  };
  entries: MemoryCompactionReviewEntry[];
};

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
const uniqueSorted = <T extends string>(values: T[]): T[] => [...new Set(values)].sort((a, b) => a.localeCompare(b)) as T[];

const readPromotedKnowledge = (projectRoot: string): MemoryKnowledgeEntry[] =>
  KNOWLEDGE_PATHS.flatMap((relativePath) => {
    const fullPath = path.join(projectRoot, relativePath);
    if (!fs.existsSync(fullPath)) return [];
    const parsed = readJson<Partial<MemoryKnowledgeArtifact>>(fullPath);
    return Array.isArray(parsed.entries) ? parsed.entries as MemoryKnowledgeEntry[] : [];
  });

const toReviewId = (candidate: ConsolidationCandidate): string =>
  createHash('sha256').update(`${candidate.consolidationCandidateId}:${candidate.fingerprint}`).digest('hex').slice(0, 16);

const summarizeDecision = (decision: MemoryCompactionBucketDecision, reasonCodes: MemoryCompactionReasonCode[]): string => {
  if (decision === 'discard') {
    return `Discard from promotion path: ${reasonCodes.join(', ')}.`;
  }
  if (decision === 'attach') {
    return `Attach replay/consolidation evidence to existing knowledge review: ${reasonCodes.join(', ')}.`;
  }
  if (decision === 'merge') {
    return `Merge replay lineage before any promotion review: ${reasonCodes.join(', ')}.`;
  }
  return `Keep as new candidate for explicit promotion review: ${reasonCodes.join(', ')}.`;
};

const classifyDecision = (candidate: ConsolidationCandidate, matchedKnowledge: MemoryKnowledgeEntry[]): MemoryCompactionDecisionRecord => {
  const reasonCodes: MemoryCompactionReasonCode[] = [];

  if (candidate.kind === 'open_question' || candidate.promotion.eligible === false && matchedKnowledge.length === 0) {
    reasonCodes.push(candidate.kind === 'open_question' ? 'promotion_ineligible_open_question' : 'promotion_ineligible_review_only');
    return {
      decision: 'discard',
      reasonCodes,
      rationale: summarizeDecision('discard', reasonCodes)
    };
  }

  if (matchedKnowledge.length > 0) {
    reasonCodes.push('knowledge_fingerprint_match');
    if (matchedKnowledge.some((entry) => entry.sourceCandidateIds.includes(candidate.sourceReplayCandidateIds[0] ?? ''))) {
      reasonCodes.push('knowledge_lineage_attach');
    }
    return {
      decision: 'attach',
      reasonCodes: uniqueSorted(reasonCodes),
      rationale: summarizeDecision('attach', uniqueSorted(reasonCodes))
    };
  }

  if ((candidate.provenance.replayCandidates?.length ?? 0) > 1 || candidate.sourceReplayCandidateIds.length > 1) {
    reasonCodes.push('consolidated_replay_merge');
  }
  if ((candidate.replayLineage.priorCandidateIds?.length ?? 0) > 0 || (candidate.replayLineage.supersedesCandidateIds?.length ?? 0) > 0) {
    reasonCodes.push('replay_lineage_merge');
  }

  if (reasonCodes.length > 0) {
    return {
      decision: 'merge',
      reasonCodes: uniqueSorted(reasonCodes),
      rationale: summarizeDecision('merge', uniqueSorted(reasonCodes))
    };
  }

  reasonCodes.push('novel_candidate_required');
  return {
    decision: 'new_candidate',
    reasonCodes,
    rationale: summarizeDecision('new_candidate', reasonCodes)
  };
};

const toEntry = (candidate: ConsolidationCandidate, promotedKnowledge: MemoryKnowledgeEntry[]): MemoryCompactionReviewEntry => {
  const matchedKnowledge = promotedKnowledge.filter((entry) => candidate.promotion.matchedKnowledgeIds.includes(entry.knowledgeId));
  const decision = classifyDecision(candidate, matchedKnowledge);

  return {
    reviewId: toReviewId(candidate),
    consolidationCandidateId: candidate.consolidationCandidateId,
    replayCandidateId: candidate.sourceReplayCandidateIds[0] ?? candidate.consolidationCandidateId,
    kind: candidate.kind,
    title: candidate.title,
    module: candidate.module,
    ruleId: candidate.ruleId,
    fingerprint: candidate.fingerprint,
    decision,
    promotion: {
      explicitOnly: true,
      eligible: candidate.promotion.eligible,
      reviewRequired: true,
      matchedKnowledgeIds: [...candidate.promotion.matchedKnowledgeIds]
    },
    salience: candidate.salience,
    provenance: {
      replayCandidates: [...candidate.provenance.replayCandidates],
      events: [...candidate.provenance.events],
      promotedKnowledge: matchedKnowledge.map((entry) => ({
        knowledgeId: entry.knowledgeId,
        kind: entry.kind,
        status: entry.status,
        fingerprint: entry.fingerprint,
        sourceCandidateIds: [...entry.sourceCandidateIds].sort((a, b) => a.localeCompare(b)),
        sourceEventFingerprints: [...entry.sourceEventFingerprints].sort((a, b) => a.localeCompare(b))
      }))
    }
  };
};

const sortEntries = (entries: MemoryCompactionReviewEntry[]): MemoryCompactionReviewEntry[] =>
  [...entries].sort((left, right) => {
    const salienceDelta = right.salience.score - left.salience.score;
    if (salienceDelta !== 0) return salienceDelta;
    return left.reviewId.localeCompare(right.reviewId);
  });

export const buildMemoryCompactionReviewArtifact = (projectRoot: string): MemoryCompactionReviewArtifact => {
  const consolidation = buildConsolidationCandidatesArtifact(projectRoot);
  const promotedKnowledge = readPromotedKnowledge(projectRoot);
  const entries = sortEntries(consolidation.candidates.map((candidate) => toEntry(candidate, promotedKnowledge)));

  return {
    schemaVersion: '1.0',
    kind: 'playbook-memory-compaction-review',
    command: 'memory-compaction-review',
    generatedAt: new Date(0).toISOString(),
    reviewOnly: true,
    authority: {
      mutation: 'read-only',
      promotion: 'review-required'
    },
    sourceArtifacts: {
      consolidationCandidates: CONSOLIDATION_CANDIDATES_RELATIVE_PATH,
      promotedKnowledge: [...KNOWLEDGE_PATHS]
    },
    summary: {
      totalEntries: entries.length,
      discard: entries.filter((entry) => entry.decision.decision === 'discard').length,
      attach: entries.filter((entry) => entry.decision.decision === 'attach').length,
      merge: entries.filter((entry) => entry.decision.decision === 'merge').length,
      newCandidate: entries.filter((entry) => entry.decision.decision === 'new_candidate').length,
      explicitPromotionRequired: entries.filter((entry) => entry.promotion.reviewRequired).length
    },
    entries
  };
};

export const writeMemoryCompactionReviewArtifact = (projectRoot: string, artifact: MemoryCompactionReviewArtifact): string => {
  const outputPath = path.join(projectRoot, MEMORY_COMPACTION_REVIEW_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return outputPath;
};

export const reviewMemoryCompaction = (projectRoot: string): MemoryCompactionReviewArtifact => {
  const artifact = buildMemoryCompactionReviewArtifact(projectRoot);
  writeMemoryCompactionReviewArtifact(projectRoot, artifact);
  return artifact;
};
