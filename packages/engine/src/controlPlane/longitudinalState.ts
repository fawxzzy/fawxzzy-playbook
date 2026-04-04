import fs from 'node:fs';
import path from 'node:path';
import { listOrchestrationExecutionRuns } from '../execution/orchestrationRunState.js';

export const LONGITUDINAL_STATE_RELATIVE_PATH = '.playbook/longitudinal-state.json' as const;

type SourceArtifactState = { path: string; present: boolean; valid: boolean };

type TimelineEvent = {
  ts: string;
  source: string;
  event: string;
  ref: string;
};

type RecurringCluster = {
  key: string;
  count: number;
  latest_ts: string | null;
  refs: string[];
};

export type LongitudinalStateArtifact = {
  schemaVersion: '1.0';
  kind: 'playbook-longitudinal-state';
  generatedAt: string;
  session_review_timelines: {
    session: TimelineEvent[];
    review: TimelineEvent[];
  };
  recurring_evidence: {
    failure_clusters: RecurringCluster[];
    finding_clusters: RecurringCluster[];
  };
  verification_outcomes: {
    verify: { present: boolean; ok: boolean | null; finding_count: number };
    verify_preflight: { present: boolean; ok: boolean | null };
    execution_runs: { total: number; completed: number; failed: number; running: number };
  };
  approvals_governance_refs: {
    required: string[];
    blocked: string[];
    refs: string[];
  };
  unresolved_risks: string[];
  knowledge_lifecycle: {
    candidates: { total: number; ids: string[] };
    promoted: { total: number; ids: string[] };
    superseded: { total: number; ids: string[] };
  };
  source_artifacts: SourceArtifactState[];
  authority: {
    mutation: 'read-only';
    execution: 'unchanged';
  };
};

const deterministicStringify = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const readJson = (repoRoot: string, relativePath: string): Record<string, unknown> | null => {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const readArray = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : [];

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean) : [];

const uniqueSorted = (values: Array<string | null | undefined>): string[] => [...new Set(values.filter((value): value is string => Boolean(value)).map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

const clusterBy = (entries: Array<{ key: string; ts: string | null; ref: string }>): RecurringCluster[] => {
  const map = new Map<string, { count: number; latestTs: string | null; refs: Set<string> }>();
  for (const entry of entries) {
    if (!entry.key) continue;
    const prev = map.get(entry.key);
    const latestTs = prev
      ? (entry.ts && (!prev.latestTs || entry.ts > prev.latestTs) ? entry.ts : prev.latestTs)
      : entry.ts;
    const refs = prev?.refs ?? new Set<string>();
    refs.add(entry.ref);
    map.set(entry.key, { count: (prev?.count ?? 0) + 1, latestTs, refs });
  }

  return [...map.entries()]
    .map(([key, value]) => ({
      key,
      count: value.count,
      latest_ts: value.latestTs,
      refs: [...value.refs].sort((a, b) => a.localeCompare(b))
    }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, 50);
};

const buildSourceArtifacts = (repoRoot: string): SourceArtifactState[] => {
  const artifacts = [
    '.playbook/session.json',
    '.playbook/evidence-envelope.json',
    '.playbook/execution-runs/*.json',
    '.playbook/test-autofix-history.json',
    '.playbook/remediation-status.json',
    '.playbook/verify.json',
    '.playbook/verify-preflight.json',
    '.playbook/review-queue.json',
    '.playbook/execution-receipt.json',
    '.playbook/review-downstream-followups.json',
    '.playbook/memory/candidates.json',
    '.playbook/memory/knowledge/decisions.json',
    '.playbook/memory/knowledge/patterns.json',
    '.playbook/memory/knowledge/failure-modes.json',
    '.playbook/memory/knowledge/invariants.json'
  ];

  return artifacts.map((artifactPath) => {
    if (artifactPath.endsWith('*.json')) {
      const present = listOrchestrationExecutionRuns(repoRoot).length > 0;
      return { path: artifactPath, present, valid: true };
    }
    const parsed = readJson(repoRoot, artifactPath);
    return { path: artifactPath, present: fs.existsSync(path.join(repoRoot, artifactPath)), valid: parsed !== null };
  });
};

const readOk = (record: Record<string, unknown> | null): boolean | null => {
  if (!record) return null;
  if (typeof record.ok === 'boolean') return record.ok;
  if (typeof record.exitCode === 'number') return record.exitCode === 0;
  return null;
};

const toIso = (value: unknown): string | null => (typeof value === 'string' && value.trim().length > 0 ? value : null);

const buildTimelines = (session: Record<string, unknown> | null, reviewQueue: Record<string, unknown> | null): LongitudinalStateArtifact['session_review_timelines'] => {
  const sessionEvents: TimelineEvent[] = [];
  const reviewEvents: TimelineEvent[] = [];

  if (session) {
    const sessionId = typeof session.sessionId === 'string' ? session.sessionId : 'session:unknown';
    const lastUpdatedTime = toIso(session.lastUpdatedTime) ?? '1970-01-01T00:00:00.000Z';
    sessionEvents.push({ ts: lastUpdatedTime, source: '.playbook/session.json', event: 'session-updated', ref: sessionId });

    const pinned = readArray(session.pinnedArtifacts)
      .map((entry) => ({
        ts: toIso(entry.pinnedAt) ?? '1970-01-01T00:00:00.000Z',
        source: '.playbook/session.json',
        event: 'artifact-pinned',
        ref: String(entry.artifact ?? 'artifact:unknown')
      }));
    sessionEvents.push(...pinned);
  }

  if (reviewQueue) {
    for (const entry of readArray(reviewQueue.entries)) {
      reviewEvents.push({
        ts: toIso(entry.createdAt) ?? '1970-01-01T00:00:00.000Z',
        source: '.playbook/review-queue.json',
        event: 'review-queued',
        ref: String(entry.id ?? entry.proposal_id ?? 'review:unknown')
      });
    }
  }

  const sortTimeline = (events: TimelineEvent[]): TimelineEvent[] =>
    [...events]
      .sort((left, right) => left.ts.localeCompare(right.ts) || left.event.localeCompare(right.event) || left.ref.localeCompare(right.ref))
      .slice(0, 200);

  return {
    session: sortTimeline(sessionEvents),
    review: sortTimeline(reviewEvents)
  };
};

const buildRecurringEvidence = (
  verify: Record<string, unknown> | null,
  remediationHistory: Record<string, unknown> | null
): LongitudinalStateArtifact['recurring_evidence'] => {
  const findingEntries = readArray(verify?.findings).map((entry, index) => {
    const ruleId = typeof entry.ruleId === 'string' ? entry.ruleId : null;
    const title = typeof entry.title === 'string' ? entry.title : null;
    const key = ruleId ?? title ?? `finding-${index + 1}`;
    return {
      key,
      ts: toIso(entry.detectedAt) ?? null,
      ref: `verify:${key}`
    };
  });

  const failureEntries = readArray(remediationHistory?.runs).flatMap((run) =>
    readStringArray(run.failure_signatures).map((signature) => ({
      key: signature,
      ts: toIso(run.generatedAt) ?? null,
      ref: String(run.run_id ?? 'run:unknown')
    }))
  );

  return {
    failure_clusters: clusterBy(failureEntries),
    finding_clusters: clusterBy(findingEntries)
  };
};

const buildVerificationOutcomes = (
  repoRoot: string,
  verify: Record<string, unknown> | null,
  verifyPreflight: Record<string, unknown> | null
): LongitudinalStateArtifact['verification_outcomes'] => {
  const runs = listOrchestrationExecutionRuns(repoRoot);
  return {
    verify: {
      present: verify !== null,
      ok: readOk(verify),
      finding_count: readArray(verify?.findings).length
    },
    verify_preflight: {
      present: verifyPreflight !== null,
      ok: readOk(verifyPreflight)
    },
    execution_runs: {
      total: runs.length,
      completed: runs.filter((entry) => entry.status === 'completed').length,
      failed: runs.filter((entry) => entry.status === 'failed').length,
      running: runs.filter((entry) => entry.status === 'running').length
    }
  };
};

const buildApprovals = (
  session: Record<string, unknown> | null,
  remediationStatus: Record<string, unknown> | null,
  reviewQueue: Record<string, unknown> | null
): LongitudinalStateArtifact['approvals_governance_refs'] => {
  const decisions = readArray(session?.evidenceEnvelope && (session.evidenceEnvelope as Record<string, unknown>).policy_decisions);
  const required = decisions.filter((entry) => entry.decision === 'requires_review').map((entry) => String(entry.proposal_id ?? 'proposal:unknown'));
  const blocked = decisions.filter((entry) => entry.decision === 'blocked').map((entry) => String(entry.proposal_id ?? 'proposal:unknown'));

  const refs = uniqueSorted([
    ...required,
    ...blocked,
    ...readStringArray(remediationStatus?.blocked_signatures),
    ...readStringArray(remediationStatus?.review_required_signatures),
    ...readArray(reviewQueue?.entries).map((entry) => String(entry.id ?? entry.proposal_id ?? 'review:unknown'))
  ]);

  return {
    required: uniqueSorted(required),
    blocked: uniqueSorted(blocked),
    refs
  };
};

const buildUnresolvedRisks = (
  verify: Record<string, unknown> | null,
  remediationStatus: Record<string, unknown> | null
): string[] => {
  const verifyRisks = readArray(verify?.findings)
    .filter((entry) => {
      const severity = typeof entry.severity === 'string' ? entry.severity.toLowerCase() : '';
      return severity === 'high' || severity === 'critical';
    })
    .map((entry) => String(entry.ruleId ?? entry.title ?? 'verify-risk'));

  const remediationRisks = [
    ...readStringArray(remediationStatus?.blocked_signatures),
    ...readStringArray(remediationStatus?.review_required_signatures),
    ...readStringArray(remediationStatus?.stable_failure_signatures)
  ];

  return uniqueSorted([...verifyRisks, ...remediationRisks]);
};

const collectKnowledgeIds = (record: Record<string, unknown> | null): string[] => {
  if (!record) return [];
  return uniqueSorted(
    readArray(record.entries).map((entry) => String(entry.id ?? entry.knowledgeId ?? entry.slug ?? '')).filter(Boolean)
  );
};

const buildKnowledgeLifecycle = (repoRoot: string): LongitudinalStateArtifact['knowledge_lifecycle'] => {
  const candidates = readJson(repoRoot, '.playbook/memory/candidates.json');
  const promoted = [
    readJson(repoRoot, '.playbook/memory/knowledge/decisions.json'),
    readJson(repoRoot, '.playbook/memory/knowledge/patterns.json'),
    readJson(repoRoot, '.playbook/memory/knowledge/failure-modes.json'),
    readJson(repoRoot, '.playbook/memory/knowledge/invariants.json')
  ];

  const candidateIds = collectKnowledgeIds(candidates);
  const promotedIds = uniqueSorted(promoted.flatMap((entry) => collectKnowledgeIds(entry)));
  const supersededIds = uniqueSorted(
    promoted.flatMap((entry) => readArray(entry?.entries).filter((row) => row.status === 'superseded').map((row) => String(row.id ?? row.knowledgeId ?? '')))
  );

  return {
    candidates: { total: candidateIds.length, ids: candidateIds.slice(0, 100) },
    promoted: { total: promotedIds.length, ids: promotedIds.slice(0, 100) },
    superseded: { total: supersededIds.length, ids: supersededIds.slice(0, 100) }
  };
};

export const readLongitudinalState = (repoRoot: string): LongitudinalStateArtifact => {
  const session = readJson(repoRoot, '.playbook/session.json');
  const remediationHistory = readJson(repoRoot, '.playbook/test-autofix-history.json');
  const remediationStatus = readJson(repoRoot, '.playbook/remediation-status.json');
  const verify = readJson(repoRoot, '.playbook/verify.json');
  const verifyPreflight = readJson(repoRoot, '.playbook/verify-preflight.json');
  const reviewQueue = readJson(repoRoot, '.playbook/review-queue.json');

  return {
    schemaVersion: '1.0',
    kind: 'playbook-longitudinal-state',
    generatedAt: new Date(0).toISOString(),
    session_review_timelines: buildTimelines(session, reviewQueue),
    recurring_evidence: buildRecurringEvidence(verify, remediationHistory),
    verification_outcomes: buildVerificationOutcomes(repoRoot, verify, verifyPreflight),
    approvals_governance_refs: buildApprovals(session, remediationStatus, reviewQueue),
    unresolved_risks: buildUnresolvedRisks(verify, remediationStatus),
    knowledge_lifecycle: buildKnowledgeLifecycle(repoRoot),
    source_artifacts: buildSourceArtifacts(repoRoot),
    authority: {
      mutation: 'read-only',
      execution: 'unchanged'
    }
  };
};

export const writeLongitudinalState = (repoRoot: string): LongitudinalStateArtifact => {
  const artifact = readLongitudinalState(repoRoot);
  const absolutePath = path.join(repoRoot, LONGITUDINAL_STATE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, deterministicStringify(artifact), 'utf8');
  return artifact;
};
