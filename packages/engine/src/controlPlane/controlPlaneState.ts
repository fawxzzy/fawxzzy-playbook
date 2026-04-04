import fs from 'node:fs';
import path from 'node:path';
import { listOrchestrationExecutionRuns, type OrchestrationExecutionRunState } from '../execution/orchestrationRunState.js';

export const CONTROL_PLANE_STATE_RELATIVE_PATH = '.playbook/control-plane.json' as const;

type ControlPlaneActor = 'planner-control-plane' | 'runtime-operator-plane' | 'app-domain-plane' | 'review-approval-actor';
type ControlPlaneExecutionMode = 'read-runtime-inspection' | 'proposal-only' | 'reviewed-mutation' | 'bounded-external-execution';
type MutationScopeLevel = 'none' | 'proposal-only' | 'reviewed-mutation' | 'bounded-external-execution';

type SourceArtifactState = { path: string; present: boolean; valid: boolean };

export type ControlPlaneStateArtifact = {
  schemaVersion: '1.0';
  kind: 'playbook-control-plane-state';
  generatedAt: string;
  active_actors: ControlPlaneActor[];
  active_execution_mode: ControlPlaneExecutionMode;
  active_approvals: { required: string[]; blockers: string[] };
  mutation_scope_level: MutationScopeLevel;
  external_execution_presence: boolean;
  receipt_lineage_refs: string[];
  stale_or_invalid_state: string[];
  source_artifacts: SourceArtifactState[];
  authority: { mutation: 'read-only'; execution: 'unchanged' };
};

const EVIDENCE_ENVELOPE_PATH = '.playbook/evidence-envelope.json' as const;
const SESSION_PATH = '.playbook/session.json' as const;
const MERGE_GUARDS_PATH = '.playbook/execution-merge-guards.json' as const;
const RENDEZVOUS_PATH = '.playbook/rendezvous-manifest.json' as const;
const INTEROP_PATH = '.playbook/lifeline-interop-runtime.json' as const;

const deterministicStringify = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const readJson = (absolutePath: string): Record<string, unknown> | null => {
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

const uniqueSorted = (values: string[]): string[] => [...new Set(values.filter((value) => value.trim().length > 0))].sort((a, b) => a.localeCompare(b));

const buildSourceArtifacts = (repoRoot: string): SourceArtifactState[] => {
  const session = readJson(path.join(repoRoot, SESSION_PATH));
  const evidence = readJson(path.join(repoRoot, EVIDENCE_ENVELOPE_PATH));
  const mergeGuards = readJson(path.join(repoRoot, MERGE_GUARDS_PATH));
  const rendezvous = readJson(path.join(repoRoot, RENDEZVOUS_PATH));
  const interop = readJson(path.join(repoRoot, INTEROP_PATH));
  return [
    { path: SESSION_PATH, present: fs.existsSync(path.join(repoRoot, SESSION_PATH)), valid: session !== null },
    { path: EVIDENCE_ENVELOPE_PATH, present: fs.existsSync(path.join(repoRoot, EVIDENCE_ENVELOPE_PATH)), valid: evidence !== null },
    { path: '.playbook/execution-runs/*.json', present: listOrchestrationExecutionRuns(repoRoot).length > 0, valid: true },
    { path: MERGE_GUARDS_PATH, present: fs.existsSync(path.join(repoRoot, MERGE_GUARDS_PATH)), valid: mergeGuards !== null },
    { path: RENDEZVOUS_PATH, present: fs.existsSync(path.join(repoRoot, RENDEZVOUS_PATH)), valid: rendezvous !== null },
    { path: INTEROP_PATH, present: fs.existsSync(path.join(repoRoot, INTEROP_PATH)), valid: interop !== null }
  ];
};

const collectReceiptRefs = (runs: OrchestrationExecutionRunState[], interop: Record<string, unknown> | null): string[] => {
  const runRefs = runs.flatMap((run) => Object.values(run.lanes).flatMap((lane) => lane.receipt_refs));
  const interopRefs = readArray(interop?.receipts).map((entry) => entry.output_artifact_path).filter((entry): entry is string => typeof entry === 'string');
  return uniqueSorted([...runRefs, ...interopRefs]);
};

export const readControlPlaneState = (repoRoot: string): ControlPlaneStateArtifact => {
  const runs = listOrchestrationExecutionRuns(repoRoot);
  const session = readJson(path.join(repoRoot, SESSION_PATH));
  const evidenceEnvelope = readJson(path.join(repoRoot, EVIDENCE_ENVELOPE_PATH));
  const mergeGuards = readJson(path.join(repoRoot, MERGE_GUARDS_PATH));
  const rendezvous = readJson(path.join(repoRoot, RENDEZVOUS_PATH));
  const interop = readJson(path.join(repoRoot, INTEROP_PATH));

  const approvalsRequired = uniqueSorted([
    ...readArray(session?.evidenceEnvelope && (session.evidenceEnvelope as Record<string, unknown>).policy_decisions)
      .filter((entry) => entry.decision === 'requires_review')
      .map((entry) => String(entry.proposal_id ?? 'proposal:unknown')),
    ...(rendezvous && rendezvous.kind === 'artifact-rendezvous-manifest' ? ['rendezvous-release-readiness'] : [])
  ]);

  const mergeGuardBlockers = readArray(mergeGuards?.runs)
    .flatMap((entry) => (Array.isArray(entry.blockingReasons) ? entry.blockingReasons : []))
    .filter((entry): entry is string => typeof entry === 'string');

  const blockedDecisions = readArray(session?.evidenceEnvelope && (session.evidenceEnvelope as Record<string, unknown>).policy_decisions)
    .filter((entry) => entry.decision === 'blocked')
    .map((entry) => String(entry.proposal_id ?? 'proposal:unknown'));

  const stale = uniqueSorted([
    ...((session && Array.isArray((session as Record<string, unknown>).pinnedArtifacts)) ? [] : ['session_invalid_or_missing']),
    ...(evidenceEnvelope === null ? ['evidence_envelope_missing_or_invalid'] : []),
    ...readArray(mergeGuards?.runs).filter((entry) => entry.staleOrConflictedState === true).map(() => 'merge_guard_stale_or_conflicted'),
    ...(runs.some((run) => run.status !== 'completed') ? ['execution_runs_incomplete'] : []),
    ...(readArray(rendezvous?.blockers).length > 0 ? ['rendezvous_blocked'] : []),
    ...(readArray(interop?.requests).some((entry) => entry.request_state === 'blocked' || entry.request_state === 'failed') ? ['interop_blocked_or_failed'] : [])
  ]);

  const blockers = uniqueSorted([...mergeGuardBlockers, ...blockedDecisions]);
  const externalExecutionPresence = Boolean(interop && readArray(interop.requests).length > 0);
  const hasProposalSignals = runs.length > 0 || readArray(session?.evidenceEnvelope && (session.evidenceEnvelope as Record<string, unknown>).proposal_ids).length > 0;

  const activeActors = uniqueSorted([
    (session || evidenceEnvelope) ? 'planner-control-plane' : '',
    runs.length > 0 ? 'runtime-operator-plane' : '',
    collectReceiptRefs(runs, interop).length > 0 ? 'app-domain-plane' : '',
    approvalsRequired.length > 0 || blockers.length > 0 ? 'review-approval-actor' : ''
  ]) as ControlPlaneActor[];

  const mode: ControlPlaneExecutionMode = stale.length > 0
    ? 'read-runtime-inspection'
    : externalExecutionPresence
      ? 'bounded-external-execution'
      : approvalsRequired.length > 0 || blockers.length > 0
        ? 'reviewed-mutation'
        : hasProposalSignals
          ? 'proposal-only'
          : 'read-runtime-inspection';

  const mutationScopeLevel: MutationScopeLevel = stale.length > 0
    ? 'none'
    : mode === 'bounded-external-execution'
      ? 'bounded-external-execution'
      : mode === 'reviewed-mutation'
        ? 'reviewed-mutation'
        : mode === 'proposal-only'
          ? 'proposal-only'
          : 'none';

  return {
    schemaVersion: '1.0',
    kind: 'playbook-control-plane-state',
    generatedAt: new Date(0).toISOString(),
    active_actors: activeActors,
    active_execution_mode: mode,
    active_approvals: {
      required: approvalsRequired,
      blockers
    },
    mutation_scope_level: mutationScopeLevel,
    external_execution_presence: externalExecutionPresence,
    receipt_lineage_refs: collectReceiptRefs(runs, interop),
    stale_or_invalid_state: stale,
    source_artifacts: buildSourceArtifacts(repoRoot),
    authority: {
      mutation: 'read-only',
      execution: 'unchanged'
    }
  };
};

export const writeControlPlaneState = (repoRoot: string): ControlPlaneStateArtifact => {
  const artifact = readControlPlaneState(repoRoot);
  const absolutePath = path.join(repoRoot, CONTROL_PLANE_STATE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, deterministicStringify(artifact), 'utf8');
  return artifact;
};
