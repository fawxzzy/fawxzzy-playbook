import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { FleetExecutionOutcomeInput, FleetExecutionReceipt } from '../adoption/executionReceipt.js';
import type { FleetUpdatedAdoptionState } from '../adoption/executionUpdatedState.js';
import { PORTABILITY_OUTCOMES_RELATIVE_PATH, readPortabilityOutcomesArtifact } from '../learning/portabilityOutcomes.js';
import {
  LIFECYCLE_CANDIDATES_RELATIVE_PATH,
  type LifecycleCandidateRecord,
  type LifecycleCandidatesArtifact,
  type LifecycleEvidenceRef,
  type LifecycleRecommendationAction
} from '../schema/lifecycleCandidate.js';

const EXECUTION_RECEIPT_RELATIVE_PATH = '.playbook/execution-receipt.json' as const;
const UPDATED_STATE_RELATIVE_PATH = '.playbook/execution-updated-state.json' as const;
const EXECUTION_OUTCOME_INPUT_RELATIVE_PATH = '.playbook/execution-outcome-input.json' as const;
const PROMOTION_RECEIPTS_RELATIVE_PATH = '.playbook/promotion-receipts.json' as const;
const GLOBAL_PATTERNS_RELATIVE_PATH = '.playbook/patterns.json' as const;
const REPO_LOCAL_PATTERNS_RELATIVE_PATH = '.playbook/memory/knowledge/patterns.json' as const;
const STALE_AFTER_DAYS = 45;
const patternIdRegex = /\b(?:pattern[.:][A-Za-z0-9._:-]+|[A-Za-z0-9_]+(?:\.[A-Za-z0-9_:-]+){1,})\b/g;

type PromotionReceipt = {
  receipt_id?: string;
  generated_at?: string;
  workflow_kind?: string;
  promotion_kind?: string;
  target_id?: string;
  summary?: string;
  outcome?: string;
};

type PromotionReceiptLog = { receipts?: PromotionReceipt[] };
type PromotedPatternEntry = { id?: string; title?: string; summary?: string; description?: string; pattern_family?: string; status?: string; provenance?: { candidate_id?: string } };
type PromotedPatternArtifact = { entries?: PromotedPatternEntry[]; patterns?: PromotedPatternEntry[] };

const safeReadJson = <T>(filePath: string): T | null => fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) as T : null;
const writeJson = (filePath: string, payload: unknown): void => { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8'); };
const unique = (values: string[]): string[] => [...new Set(values)].sort((a,b)=>a.localeCompare(b));
const iso = (value: string | undefined, fallback = new Date(0).toISOString()): string => {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString();
};
const stableFingerprint = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const repoRelative = (projectRoot: string, rel: string): string => path.relative(projectRoot, path.join(projectRoot, rel)).replaceAll('\\', '/');
const extractPatternIds = (...texts: Array<string | undefined>): string[] => {
  const matches = texts.flatMap((text) => (text ?? '').match(patternIdRegex) ?? []);
  return unique(matches.filter((value) => value.includes('.') || value.startsWith('pattern:') || value.startsWith('pattern.')).map((value) => value.replace(/^pattern:/, '')));
};

const readPromotedPatterns = (projectRoot: string): Set<string> => {
  const ids: string[] = [];
  for (const rel of [GLOBAL_PATTERNS_RELATIVE_PATH, REPO_LOCAL_PATTERNS_RELATIVE_PATH]) {
    const parsed = safeReadJson<PromotedPatternArtifact>(path.join(projectRoot, rel));
    const records = Array.isArray(parsed?.patterns) ? parsed?.patterns : Array.isArray(parsed?.entries) ? parsed?.entries : [];
    for (const record of records) {
      if (typeof record?.id === 'string' && record.id.length > 0) ids.push(record.id);
    }
  }
  return new Set(ids);
};

const collectExecutionEvidence = (
  receipt: FleetExecutionReceipt,
  updatedState: FleetUpdatedAdoptionState,
  outcomeInput: FleetExecutionOutcomeInput,
  validPatternIds: Set<string>
): LifecycleEvidenceRef[] => {
  const evidence: LifecycleEvidenceRef[] = [];
  for (const prompt of receipt.prompt_results) {
    const targetPatternIds = extractPatternIds(prompt.notes, ...prompt.evidence).filter((id) => validPatternIds.has(id));
    if (targetPatternIds.length === 0) continue;
    evidence.push({
      evidence_id: `execution-receipt:${prompt.prompt_id}`,
      kind: 'execution-receipt',
      source_path: EXECUTION_RECEIPT_RELATIVE_PATH,
      source_ref: `prompt_results/${prompt.prompt_id}`,
      observed_at: iso(receipt.generated_at),
      summary: `${prompt.status} for ${prompt.repo_id}: ${prompt.notes}`,
      target_pattern_ids: targetPatternIds,
      payload_fingerprint: stableFingerprint(prompt)
    });
  }
  for (const drift of receipt.verification_summary.planned_vs_actual_drift) {
    const targetPatternIds = extractPatternIds(drift.prompt_id).filter((id) => validPatternIds.has(id));
    if (targetPatternIds.length === 0) continue;
    evidence.push({
      evidence_id: `execution-drift:${drift.prompt_id}`,
      kind: 'execution-updated-state',
      source_path: UPDATED_STATE_RELATIVE_PATH,
      source_ref: `planned_vs_actual_drift/${drift.prompt_id}`,
      observed_at: iso(updatedState.generated_at),
      summary: `planned ${drift.expected} but observed ${drift.observed} for ${drift.repo_id}`,
      target_pattern_ids: targetPatternIds,
      payload_fingerprint: stableFingerprint(drift)
    });
  }
  for (const outcome of outcomeInput.prompt_outcomes) {
    const targetPatternIds = extractPatternIds(outcome.notes, outcome.prompt_id).filter((id) => validPatternIds.has(id));
    if (targetPatternIds.length === 0) continue;
    evidence.push({
      evidence_id: `execution-outcome-input:${outcome.prompt_id}`,
      kind: 'execution-outcome-input',
      source_path: EXECUTION_OUTCOME_INPUT_RELATIVE_PATH,
      source_ref: `prompt_outcomes/${outcome.prompt_id}`,
      observed_at: iso(outcomeInput.generated_at),
      summary: `${outcome.status} for ${outcome.repo_id}: ${outcome.notes ?? 'no notes'}`,
      target_pattern_ids: targetPatternIds,
      payload_fingerprint: stableFingerprint(outcome)
    });
  }
  return evidence;
};

const collectPromotionEvidence = (projectRoot: string, validPatternIds: Set<string>): LifecycleEvidenceRef[] => {
  const log = safeReadJson<PromotionReceiptLog>(path.join(projectRoot, PROMOTION_RECEIPTS_RELATIVE_PATH));
  const receipts = Array.isArray(log?.receipts) ? log.receipts : [];
  return receipts.flatMap((receipt) => {
    const targetId = typeof receipt.target_id === 'string' ? receipt.target_id : '';
    if (!validPatternIds.has(targetId)) return [];
    return [{
      evidence_id: receipt.receipt_id ?? `promotion-receipt:${stableFingerprint(receipt).slice(0, 12)}`,
      kind: 'promotion-receipt' as const,
      source_path: PROMOTION_RECEIPTS_RELATIVE_PATH,
      source_ref: receipt.receipt_id ?? targetId,
      observed_at: iso(receipt.generated_at),
      summary: `${receipt.workflow_kind ?? receipt.promotion_kind ?? 'promotion'} ${receipt.outcome ?? 'observed'}: ${receipt.summary ?? targetId}`,
      target_pattern_ids: [targetId],
      payload_fingerprint: stableFingerprint(receipt)
    }];
  });
};

const collectOutcomeEvidence = (projectRoot: string, validPatternIds: Set<string>): LifecycleEvidenceRef[] => {
  const artifact = readPortabilityOutcomesArtifact(projectRoot);
  return artifact.outcomes.flatMap((outcome) => {
    if (!validPatternIds.has(outcome.pattern_id)) return [];
    return [{
      evidence_id: `portability-outcome:${outcome.recommendation_id}`,
      kind: 'portability-outcome' as const,
      source_path: PORTABILITY_OUTCOMES_RELATIVE_PATH,
      source_ref: outcome.recommendation_id,
      observed_at: iso(outcome.timestamp),
      summary: `${outcome.decision_status}/${outcome.adoption_status ?? 'n/a'}/${outcome.observed_outcome ?? 'n/a'}${outcome.decision_reason ? `: ${outcome.decision_reason}` : ''}`,
      target_pattern_ids: [outcome.pattern_id],
      payload_fingerprint: stableFingerprint(outcome)
    }];
  });
};

const actionRank: Record<LifecycleRecommendationAction, number> = { retire: 4, supersede: 3, demote: 2, freshness_review: 1 };
const inferAction = (evidence: LifecycleEvidenceRef[]): LifecycleRecommendationAction => {
  const text = evidence.map((entry) => entry.summary.toLowerCase()).join(' | ');
  if (text.includes('rollback') || text.includes('deactivation') || text.includes('retire')) return 'retire';
  if (text.includes('supersede')) return 'supersede';
  if (text.includes('unsuccessful') || text.includes('rejected') || text.includes('drift')) return 'demote';
  return 'freshness_review';
};
const inferDerivedFrom = (evidence: LifecycleEvidenceRef[]): LifecycleCandidateRecord['derived_from'] => {
  const derived = evidence.flatMap((entry) => {
    if (entry.kind === 'promotion-receipt') return ['promotion-history'] as const;
    if (entry.kind === 'portability-outcome') return ['later-outcomes'] as const;
    if (entry.kind === 'execution-updated-state') return ['drift-signals'] as const;
    if (entry.kind === 'execution-receipt' || entry.kind === 'execution-outcome-input') {
      return entry.summary.toLowerCase().includes('rollback') || entry.summary.toLowerCase().includes('deactivation')
        ? ['rollback-events'] as const
        : ['receipts'] as const;
    }
    return [] as const;
  });
  return unique([...derived]) as LifecycleCandidateRecord['derived_from'];
};

export const generateLifecycleCandidatesArtifact = (input: {
  projectRoot: string;
  receipt: FleetExecutionReceipt;
  updatedState: FleetUpdatedAdoptionState;
  outcomeInput: FleetExecutionOutcomeInput;
}): LifecycleCandidatesArtifact => {
  const validPatternIds = readPromotedPatterns(input.projectRoot);
  const evidence = [
    ...collectExecutionEvidence(input.receipt, input.updatedState, input.outcomeInput, validPatternIds),
    ...collectPromotionEvidence(input.projectRoot, validPatternIds),
    ...collectOutcomeEvidence(input.projectRoot, validPatternIds)
  ].sort((a, b) => a.observed_at.localeCompare(b.observed_at) || a.evidence_id.localeCompare(b.evidence_id));

  const grouped = new Map<string, LifecycleEvidenceRef[]>();
  for (const entry of evidence) {
    for (const targetPatternId of entry.target_pattern_ids) {
      const items = grouped.get(targetPatternId) ?? [];
      items.push({ ...entry, target_pattern_ids: [targetPatternId] });
      grouped.set(targetPatternId, items);
    }
  }

  const candidates: LifecycleCandidateRecord[] = [...grouped.entries()].map(([targetPatternId, sourceEvidence]) => {
    const sortedEvidence = [...sourceEvidence].sort((a, b) => a.observed_at.localeCompare(b.observed_at) || a.evidence_id.localeCompare(b.evidence_id));
    const recommended_action = inferAction(sortedEvidence);
    const explainability = unique(sortedEvidence.map((entry) => `${entry.kind} @ ${entry.observed_at}: ${entry.summary}`));
    const created_at = sortedEvidence[sortedEvidence.length - 1]?.observed_at ?? new Date(0).toISOString();
    const recommendation_id = `lifecycle:${createHash('sha256').update(`${targetPatternId}:${recommended_action}:${sortedEvidence.map((entry) => entry.payload_fingerprint).join('|')}`).digest('hex').slice(0, 16)}`;
    return {
      recommendation_id,
      target_pattern_id: targetPatternId,
      recommended_action,
      confidence: Number(Math.min(0.99, 0.4 + sortedEvidence.length * 0.15 + actionRank[recommended_action] * 0.05).toFixed(2)),
      explainability,
      source_evidence: sortedEvidence,
      source_evidence_ids: unique(sortedEvidence.map((entry) => entry.evidence_id)),
      provenance_fingerprints: unique(sortedEvidence.map((entry) => entry.payload_fingerprint)),
      derived_from: inferDerivedFrom(sortedEvidence),
      status: 'candidate' as const,
      created_at,
      freshness: {
        latest_observed_at: created_at,
        stale_after_days: STALE_AFTER_DAYS
      }
    };
  }).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.confidence - a.confidence || a.recommendation_id.localeCompare(b.recommendation_id));

  return {
    schemaVersion: '1.0',
    kind: 'pattern-lifecycle-candidates',
    generatedAt: candidates[0]?.created_at ?? input.updatedState.generated_at ?? input.receipt.generated_at,
    evidence,
    candidates
  };
};

export const writeLifecycleCandidatesArtifact = (projectRoot: string, artifact: LifecycleCandidatesArtifact): string => {
  const targetPath = path.join(projectRoot, LIFECYCLE_CANDIDATES_RELATIVE_PATH);
  writeJson(targetPath, artifact);
  return repoRelative(projectRoot, LIFECYCLE_CANDIDATES_RELATIVE_PATH);
};

export const generateAndWriteLifecycleCandidatesArtifact = (input: {
  projectRoot: string;
  receipt: FleetExecutionReceipt;
  updatedState: FleetUpdatedAdoptionState;
  outcomeInput: FleetExecutionOutcomeInput;
}): { artifact: LifecycleCandidatesArtifact; artifactPath: string } => {
  const artifact = generateLifecycleCandidatesArtifact(input);
  return { artifact, artifactPath: writeLifecycleCandidatesArtifact(input.projectRoot, artifact) };
};

export const readLifecycleCandidatesArtifact = (projectRoot: string): LifecycleCandidatesArtifact =>
  safeReadJson<LifecycleCandidatesArtifact>(path.join(projectRoot, LIFECYCLE_CANDIDATES_RELATIVE_PATH)) ?? {
    schemaVersion: '1.0',
    kind: 'pattern-lifecycle-candidates',
    generatedAt: new Date(0).toISOString(),
    evidence: [],
    candidates: []
  };
