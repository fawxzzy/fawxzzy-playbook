import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readJsonArtifact, writeJsonArtifact } from '../artifacts/artifactIO.js';
import type { ReportFailure, ReportWarning, VerifyReport } from '../report/types.js';

export const VERIFY_FINDING_STATE_RELATIVE_PATH = '.playbook/finding-state.json';
export const VERIFY_FINDING_STATE_SCHEMA_VERSION = '1.0' as const;

export type VerifyFindingStatus = 'new' | 'existing' | 'resolved' | 'ignored';

export type VerifyFindingObservation = {
  kind: 'failure' | 'warning';
  ruleId: string;
  id: string;
  message: string;
  evidence?: string;
};

export type VerifyFindingRecord = {
  findingId: string;
  ruleId: string;
  normalizedLocation: string;
  evidenceHash: string;
  state: VerifyFindingStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  evidenceRefs: string[];
};

export type VerifyFindingActiveRecord = Omit<VerifyFindingRecord, 'state'> & {
  state: 'new' | 'existing' | 'ignored';
};

export type VerifyFindingResolvedRecord = Omit<VerifyFindingRecord, 'state'> & {
  state: 'resolved';
};

export type VerifyFindingStateArtifact = {
  schemaVersion: typeof VERIFY_FINDING_STATE_SCHEMA_VERSION;
  kind: 'playbook-verify-finding-state';
  generatedAt: string;
  baselineRef: string;
  summary: {
    total: number;
    new: number;
    existing: number;
    resolved: number;
    ignored: number;
  };
  findings: VerifyFindingActiveRecord[];
  resolved: VerifyFindingResolvedRecord[];
};

const readExistingState = (repoRoot: string): VerifyFindingStateArtifact | null => {
  const absolutePath = path.join(repoRoot, VERIFY_FINDING_STATE_RELATIVE_PATH);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  try {
    return readJsonArtifact<VerifyFindingStateArtifact>(absolutePath);
  } catch {
    return null;
  }
};

const stableHash = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const normalizeLocation = (finding: VerifyFindingObservation): string => {
  const source = finding.evidence?.trim().length ? finding.evidence : finding.message;
  return normalizeWhitespace(source).replace(/\\/g, '/');
};

const computeEvidenceHash = (finding: VerifyFindingObservation): string =>
  stableHash(JSON.stringify({
    evidence: finding.evidence ?? null,
    message: finding.message,
    kind: finding.kind
  }));

const computeFindingId = (input: {
  ruleId: string;
  normalizedLocation: string;
  baselineRef: string;
  evidenceHash: string;
}): string =>
  `verify.finding:${stableHash(JSON.stringify(input))}`;

const dedupeSort = (values: string[]): string[] => [...new Set(values.map((entry) => entry.trim()).filter((entry) => entry.length > 0))].sort((left, right) => left.localeCompare(right));

const toObservation = (finding: ReportFailure | ReportWarning, kind: 'failure' | 'warning'): VerifyFindingObservation => ({
  kind,
  ruleId: finding.id,
  id: finding.id,
  message: finding.message,
  evidence: 'evidence' in finding ? finding.evidence : undefined
});

export const buildVerifyFindingObservations = (report: Pick<VerifyReport, 'failures' | 'warnings'>): VerifyFindingObservation[] => [
  ...report.failures.map((failure) => toObservation(failure, 'failure')),
  ...report.warnings.map((warning) => toObservation(warning, 'warning'))
];

export const deriveVerifyFindingState = (
  repoRoot: string,
  input: {
    baselineRef: string;
    findings: VerifyFindingObservation[];
    generatedAt?: string;
  }
): VerifyFindingStateArtifact => {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const previous = readExistingState(repoRoot);
  const previousById = new Map(previous?.findings.map((entry) => [entry.findingId, entry]) ?? []);
  const seenIds = new Set<string>();

  const findings: VerifyFindingActiveRecord[] = [];
  const resolved: VerifyFindingResolvedRecord[] = [];

  for (const finding of input.findings) {
    const normalizedLocation = normalizeLocation(finding);
    const evidenceHash = computeEvidenceHash(finding);
    const findingId = computeFindingId({
      ruleId: finding.ruleId,
      normalizedLocation,
      baselineRef: input.baselineRef,
      evidenceHash
    });
    const prior = previousById.get(findingId);
    const state: VerifyFindingStatus = prior ? (prior.state === 'ignored' ? 'ignored' : 'existing') : 'new';
    const record: VerifyFindingActiveRecord = {
      findingId,
      ruleId: finding.ruleId,
      normalizedLocation,
      evidenceHash,
      state,
      firstSeenAt: prior?.firstSeenAt ?? generatedAt,
      lastSeenAt: generatedAt,
      evidenceRefs: dedupeSort([...(prior?.evidenceRefs ?? []), finding.evidence ?? finding.message])
    };

    findings.push(record);
    seenIds.add(findingId);
  }

  for (const prior of previous?.findings ?? []) {
    if (seenIds.has(prior.findingId)) {
      continue;
    }

    resolved.push({
      findingId: prior.findingId,
      ruleId: prior.ruleId,
      normalizedLocation: prior.normalizedLocation,
      evidenceHash: prior.evidenceHash,
      state: 'resolved',
      firstSeenAt: prior.firstSeenAt,
      lastSeenAt: generatedAt,
      evidenceRefs: prior.evidenceRefs
    });
  }

  findings.sort((left, right) => left.findingId.localeCompare(right.findingId));
  resolved.sort((left, right) => left.findingId.localeCompare(right.findingId));

  const summary = {
    total: findings.length + resolved.length,
    new: findings.filter((entry) => entry.state === 'new').length,
    existing: findings.filter((entry) => entry.state === 'existing').length,
    resolved: resolved.length,
    ignored: findings.filter((entry) => entry.state === 'ignored').length
  };

  const artifact: VerifyFindingStateArtifact = {
    schemaVersion: VERIFY_FINDING_STATE_SCHEMA_VERSION,
    kind: 'playbook-verify-finding-state',
    generatedAt,
    baselineRef: input.baselineRef,
    summary,
    findings,
    resolved
  };

  writeJsonArtifact(path.join(repoRoot, VERIFY_FINDING_STATE_RELATIVE_PATH), artifact as unknown as Record<string, unknown>);
  return artifact;
};
