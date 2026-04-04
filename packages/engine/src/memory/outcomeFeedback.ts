import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const OUTCOME_FEEDBACK_SCHEMA_VERSION = '1.0' as const;
export const OUTCOME_FEEDBACK_RELATIVE_PATH = '.playbook/outcome-feedback.json' as const;

const EXECUTION_RECEIPT_PATH = '.playbook/execution-receipt.json' as const;
const INTEROP_UPDATED_TRUTH_PATH = '.playbook/interop-updated-truth.json' as const;
const INTEROP_FOLLOWUPS_PATH = '.playbook/interop-followups.json' as const;
const REMEDIATION_STATUS_PATH = '.playbook/remediation-status.json' as const;
const REMEDIATION_HISTORY_PATH = '.playbook/test-autofix-history.json' as const;

type OutcomeClass = 'success' | 'bounded-failure' | 'blocked-policy' | 'rollback-deactivation' | 'later-regression';
type SourceType = 'execution-receipt' | 'interop-updated-truth' | 'interop-followup' | 'remediation-status' | 'remediation-history';

type OutcomeFeedbackRow = {
  outcomeId: string;
  outcomeClass: OutcomeClass;
  sourceType: SourceType;
  sourceRef: string;
  observedAt: string;
  summary: string;
  provenanceRefs: string[];
  candidateSignals: {
    confidenceUpdate: {
      direction: 'up' | 'down' | 'flat';
      magnitude: number;
      rationale: string;
    };
    triggerQualityNotes: string[];
    staleKnowledgeFlags: string[];
    trendUpdates: string[];
  };
  candidateOnly: true;
};

export type OutcomeFeedbackArtifact = {
  schemaVersion: typeof OUTCOME_FEEDBACK_SCHEMA_VERSION;
  kind: 'playbook-outcome-feedback';
  command: 'outcome-feedback';
  reviewOnly: true;
  authority: {
    mutation: 'read-only';
    promotion: 'review-required';
  };
  generatedAt: string;
  sourceArtifacts: {
    executionReceiptPath: typeof EXECUTION_RECEIPT_PATH;
    interopUpdatedTruthPath: typeof INTEROP_UPDATED_TRUTH_PATH;
    interopFollowupsPath: typeof INTEROP_FOLLOWUPS_PATH;
    remediationStatusPath: typeof REMEDIATION_STATUS_PATH;
    remediationHistoryPath: typeof REMEDIATION_HISTORY_PATH;
  };
  outcomeCounts: Record<OutcomeClass, number>;
  outcomes: OutcomeFeedbackRow[];
  signals: {
    confidence: string[];
    triggerQuality: string[];
    staleKnowledge: string[];
    trends: string[];
  };
  governance: {
    candidateOnly: true;
    autoPromotion: false;
    autoMutation: false;
    reviewRequired: true;
  };
};

const deterministicStringify = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const readJson = <T>(repoRoot: string, relativePath: string): T | null => {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) return null;
  return JSON.parse(fs.readFileSync(absolute, 'utf8')) as T;
};
const uniqueSorted = (values: Array<string | null | undefined>): string[] =>
  [...new Set(values.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
const toIso = (value: unknown, fallback = new Date(0).toISOString()): string => {
  if (typeof value !== 'string' || value.trim().length === 0) return fallback;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString();
};
const includesAny = (text: string, needles: string[]): boolean => needles.some((needle) => text.includes(needle));
const sha = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12);

const classifyByText = (value: string): OutcomeClass => {
  const lower = value.toLowerCase();
  if (includesAny(lower, ['rollback', 'deactivation'])) return 'rollback-deactivation';
  if (includesAny(lower, ['regression'])) return 'later-regression';
  if (includesAny(lower, ['policy', 'blocked', 'review_required'])) return 'blocked-policy';
  if (includesAny(lower, ['success', 'completed', 'fixed'])) return 'success';
  return 'bounded-failure';
};

const toSignals = (outcomeClass: OutcomeClass, summary: string): OutcomeFeedbackRow['candidateSignals'] => {
  if (outcomeClass === 'success') {
    return {
      confidenceUpdate: { direction: 'up', magnitude: 0.1, rationale: 'Verified success increases confidence for similar bounded automation paths.' },
      triggerQualityNotes: ['Trigger path produced a verified successful result.'],
      staleKnowledgeFlags: [],
      trendUpdates: ['Successful-runtime-outcome trend incremented.']
    };
  }

  if (outcomeClass === 'rollback-deactivation') {
    return {
      confidenceUpdate: { direction: 'down', magnitude: 0.3, rationale: 'Rollback/deactivation is a first-class negative runtime signal that lowers confidence.' },
      triggerQualityNotes: ['Trigger quality requires review because rollback/deactivation was observed.'],
      staleKnowledgeFlags: ['Potential stale knowledge or stale template candidate; explicit review recommended.'],
      trendUpdates: ['Rollback/deactivation trend incremented as a dedicated class.']
    };
  }

  if (outcomeClass === 'later-regression') {
    return {
      confidenceUpdate: { direction: 'down', magnitude: 0.25, rationale: 'Later regression indicates previously effective behavior may no longer hold.' },
      triggerQualityNotes: ['Initial trigger may have become brittle under later conditions.'],
      staleKnowledgeFlags: ['Later regression suggests candidate stale-knowledge risk.'],
      trendUpdates: ['Later-regression trend incremented.']
    };
  }

  if (outcomeClass === 'blocked-policy') {
    return {
      confidenceUpdate: { direction: 'flat', magnitude: 0.05, rationale: 'Blocked/policy outcomes reflect governance boundaries, not direct execution quality changes.' },
      triggerQualityNotes: ['Trigger reached policy or review boundary; refine pre-check hints.'],
      staleKnowledgeFlags: [],
      trendUpdates: ['Blocked/policy trend incremented.']
    };
  }

  return {
    confidenceUpdate: { direction: 'down', magnitude: 0.15, rationale: `Bounded failure (${summary}) reduces confidence while preserving no-mutation governance boundaries.` },
    triggerQualityNotes: ['Trigger quality should be reviewed against failure evidence.'],
    staleKnowledgeFlags: ['Candidate stale-knowledge review may be warranted for repeated bounded failures.'],
    trendUpdates: ['Bounded-failure trend incremented.']
  };
};

const pushOutcome = (rows: OutcomeFeedbackRow[], input: Omit<OutcomeFeedbackRow, 'outcomeId' | 'candidateSignals' | 'candidateOnly'>): void => {
  const outcomeClass = input.outcomeClass;
  const summary = input.summary.trim();
  rows.push({
    ...input,
    outcomeId: `outcome:${input.sourceType}:${sha([input.sourceRef, input.observedAt, outcomeClass, summary])}`,
    summary,
    provenanceRefs: uniqueSorted(input.provenanceRefs),
    candidateSignals: toSignals(outcomeClass, summary),
    candidateOnly: true
  });
};

const collectExecutionReceipt = (repoRoot: string, rows: OutcomeFeedbackRow[]): void => {
  const receipt = readJson<{ generated_at?: string; prompt_results?: Array<Record<string, unknown>> }>(repoRoot, EXECUTION_RECEIPT_PATH);
  if (!receipt || !Array.isArray(receipt.prompt_results)) return;
  for (const prompt of receipt.prompt_results) {
    const promptId = typeof prompt.prompt_id === 'string' ? prompt.prompt_id : 'prompt:unknown';
    const status = typeof prompt.status === 'string' ? prompt.status : 'failed';
    const verificationPassed = prompt.verification_passed === true;
    const notes = typeof prompt.notes === 'string' ? prompt.notes : '';
    const evidence = Array.isArray(prompt.evidence) ? prompt.evidence.filter((entry): entry is string => typeof entry === 'string') : [];
    const text = `${status} ${notes} ${evidence.join(' ')}`.toLowerCase();
    const outcomeClass = includesAny(text, ['rollback', 'deactivation'])
      ? 'rollback-deactivation'
      : status === 'success' && verificationPassed
        ? 'success'
        : 'bounded-failure';
    pushOutcome(rows, {
      outcomeClass,
      sourceType: 'execution-receipt',
      sourceRef: `prompt_results/${promptId}`,
      observedAt: toIso(receipt.generated_at),
      summary: `execution receipt ${status} (verification_passed=${verificationPassed}) for ${promptId}${notes ? `: ${notes}` : ''}`,
      provenanceRefs: [EXECUTION_RECEIPT_PATH, `receipt:${promptId}`, ...evidence]
    });
  }
};

const collectInteropUpdatedTruth = (repoRoot: string, rows: OutcomeFeedbackRow[]): void => {
  const updated = readJson<{ updates?: Array<Record<string, unknown>> }>(repoRoot, INTEROP_UPDATED_TRUTH_PATH);
  if (!updated || !Array.isArray(updated.updates)) return;
  for (const entry of updated.updates) {
    const receiptId = typeof entry.receiptId === 'string' ? entry.receiptId : 'receipt:unknown';
    const summary = entry.canonicalOutcomeSummary && typeof entry.canonicalOutcomeSummary === 'object'
      ? entry.canonicalOutcomeSummary as Record<string, unknown>
      : {};
    const outcome = typeof summary.outcome === 'string' ? summary.outcome : 'failed';
    const detail = typeof summary.detail === 'string' ? summary.detail : '';
    const composed = `${outcome} ${detail}`;
    const classified: OutcomeClass = includesAny(composed.toLowerCase(), ['rollback', 'deactivation'])
      ? 'rollback-deactivation'
      : outcome === 'completed'
        ? 'success'
        : outcome === 'blocked'
          ? 'blocked-policy'
          : 'bounded-failure';

    pushOutcome(rows, {
      outcomeClass: classified,
      sourceType: 'interop-updated-truth',
      sourceRef: `updates/${receiptId}`,
      observedAt: toIso(summary.completedAt),
      summary: `interop updated-truth outcome=${outcome}${detail ? ` detail=${detail}` : ''}`,
      provenanceRefs: [INTEROP_UPDATED_TRUTH_PATH, `receipt:${receiptId}`]
    });
  }
};

const collectInteropFollowups = (repoRoot: string, rows: OutcomeFeedbackRow[]): void => {
  const followups = readJson<{ followups?: Array<Record<string, unknown>> }>(repoRoot, INTEROP_FOLLOWUPS_PATH);
  if (!followups || !Array.isArray(followups.followups)) return;
  for (const entry of followups.followups) {
    const followupId = typeof entry.followupId === 'string' ? entry.followupId : 'followup:unknown';
    const text = `${typeof entry.nextActionText === 'string' ? entry.nextActionText : ''} ${typeof entry.followupType === 'string' ? entry.followupType : ''}`;
    const reasonCode = entry.reviewQueueEntry && typeof entry.reviewQueueEntry === 'object' && typeof (entry.reviewQueueEntry as Record<string, unknown>).triggerReasonCode === 'string'
      ? (entry.reviewQueueEntry as Record<string, unknown>).triggerReasonCode as string
      : '';

    const outcomeClass = reasonCode.includes('policy')
      ? 'blocked-policy'
      : classifyByText(`${reasonCode} ${text}`);

    pushOutcome(rows, {
      outcomeClass,
      sourceType: 'interop-followup',
      sourceRef: `followups/${followupId}`,
      observedAt: new Date(0).toISOString(),
      summary: `interop followup ${followupId} reason=${reasonCode || 'n/a'} ${text}`,
      provenanceRefs: [INTEROP_FOLLOWUPS_PATH, `followup:${followupId}`]
    });
  }
};

const collectRemediationStatus = (repoRoot: string, rows: OutcomeFeedbackRow[]): void => {
  const status = readJson<Record<string, unknown>>(repoRoot, REMEDIATION_STATUS_PATH);
  if (!status) return;
  const latest = status.latest_result && typeof status.latest_result === 'object' ? status.latest_result as Record<string, unknown> : {};
  const finalStatus = typeof latest.final_status === 'string' ? latest.final_status : '';
  if (!finalStatus) return;
  const outcomeClass = classifyByText(finalStatus);
  pushOutcome(rows, {
    outcomeClass,
    sourceType: 'remediation-status',
    sourceRef: 'latest_result',
    observedAt: toIso(status.generatedAt),
    summary: `remediation latest_result final_status=${finalStatus}`,
    provenanceRefs: [REMEDIATION_STATUS_PATH, `final_status:${finalStatus}`]
  });
};

const collectRemediationHistory = (repoRoot: string, rows: OutcomeFeedbackRow[]): void => {
  const history = readJson<{ runs?: Array<Record<string, unknown>> }>(repoRoot, REMEDIATION_HISTORY_PATH);
  if (!history || !Array.isArray(history.runs)) return;
  const bySignature = new Map<string, { fixedAt: string[]; regressions: string[] }>();
  for (const run of history.runs) {
    const finalStatus = typeof run.final_status === 'string' ? run.final_status : '';
    const runId = typeof run.run_id === 'string' ? run.run_id : 'run:unknown';
    const generatedAt = toIso(run.generatedAt);
    const signatures = Array.isArray(run.failure_signatures) ? run.failure_signatures.filter((entry): entry is string => typeof entry === 'string') : [];
    for (const signature of signatures) {
      const bucket = bySignature.get(signature) ?? { fixedAt: [], regressions: [] };
      if (finalStatus === 'fixed' || finalStatus === 'partially_fixed') {
        bucket.fixedAt.push(generatedAt);
      }
      if (finalStatus === 'not_fixed' || finalStatus === 'blocked_low_confidence' || finalStatus === 'blocked') {
        bucket.regressions.push(runId);
      }
      bySignature.set(signature, bucket);
    }
  }

  for (const [signature, bucket] of [...bySignature.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (bucket.fixedAt.length === 0 || bucket.regressions.length === 0) continue;
    pushOutcome(rows, {
      outcomeClass: 'later-regression',
      sourceType: 'remediation-history',
      sourceRef: `runs/${signature}`,
      observedAt: bucket.fixedAt.sort((a, b) => b.localeCompare(a))[0] ?? new Date(0).toISOString(),
      summary: `later regression observed for failure signature ${signature} after prior fixed outcome(s)`,
      provenanceRefs: [REMEDIATION_HISTORY_PATH, `failure_signature:${signature}`]
    });
  }
};

export const buildOutcomeFeedbackArtifact = (repoRoot: string): OutcomeFeedbackArtifact => {
  const rows: OutcomeFeedbackRow[] = [];
  collectExecutionReceipt(repoRoot, rows);
  collectInteropUpdatedTruth(repoRoot, rows);
  collectInteropFollowups(repoRoot, rows);
  collectRemediationStatus(repoRoot, rows);
  collectRemediationHistory(repoRoot, rows);

  const outcomes = [...rows].sort((left, right) =>
    left.outcomeClass.localeCompare(right.outcomeClass) ||
    left.observedAt.localeCompare(right.observedAt) ||
    left.outcomeId.localeCompare(right.outcomeId)
  );

  const outcomeCounts: Record<OutcomeClass, number> = {
    success: outcomes.filter((row) => row.outcomeClass === 'success').length,
    'bounded-failure': outcomes.filter((row) => row.outcomeClass === 'bounded-failure').length,
    'blocked-policy': outcomes.filter((row) => row.outcomeClass === 'blocked-policy').length,
    'rollback-deactivation': outcomes.filter((row) => row.outcomeClass === 'rollback-deactivation').length,
    'later-regression': outcomes.filter((row) => row.outcomeClass === 'later-regression').length
  };

  return {
    schemaVersion: OUTCOME_FEEDBACK_SCHEMA_VERSION,
    kind: 'playbook-outcome-feedback',
    command: 'outcome-feedback',
    reviewOnly: true,
    authority: {
      mutation: 'read-only',
      promotion: 'review-required'
    },
    generatedAt: outcomes[outcomes.length - 1]?.observedAt ?? new Date(0).toISOString(),
    sourceArtifacts: {
      executionReceiptPath: EXECUTION_RECEIPT_PATH,
      interopUpdatedTruthPath: INTEROP_UPDATED_TRUTH_PATH,
      interopFollowupsPath: INTEROP_FOLLOWUPS_PATH,
      remediationStatusPath: REMEDIATION_STATUS_PATH,
      remediationHistoryPath: REMEDIATION_HISTORY_PATH
    },
    outcomeCounts,
    outcomes,
    signals: {
      confidence: uniqueSorted(outcomes.map((row) => `${row.outcomeClass}:${row.candidateSignals.confidenceUpdate.direction}:${row.candidateSignals.confidenceUpdate.magnitude}`)),
      triggerQuality: uniqueSorted(outcomes.flatMap((row) => row.candidateSignals.triggerQualityNotes)),
      staleKnowledge: uniqueSorted(outcomes.flatMap((row) => row.candidateSignals.staleKnowledgeFlags)),
      trends: uniqueSorted(outcomes.flatMap((row) => row.candidateSignals.trendUpdates))
    },
    governance: {
      candidateOnly: true,
      autoPromotion: false,
      autoMutation: false,
      reviewRequired: true
    }
  };
};

export const writeOutcomeFeedbackArtifact = (repoRoot: string, artifact: OutcomeFeedbackArtifact): string => {
  const absolute = path.join(repoRoot, OUTCOME_FEEDBACK_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, deterministicStringify(artifact), 'utf8');
  return OUTCOME_FEEDBACK_RELATIVE_PATH;
};

export const buildAndWriteOutcomeFeedbackArtifact = (repoRoot: string): { artifactPath: string; artifact: OutcomeFeedbackArtifact } => {
  const artifact = buildOutcomeFeedbackArtifact(repoRoot);
  return {
    artifact,
    artifactPath: writeOutcomeFeedbackArtifact(repoRoot, artifact)
  };
};
