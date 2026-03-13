import path from 'node:path';
import {
  createControlPlaneSchemaMetadata,
  type ApprovalState,
  type PolicyDecisionRecord,
  type PolicyState
} from '@zachariahredfield/playbook-core';

export const policyDecisionCodes = [
  'READ_ONLY_ALLOWED',
  'MUTATION_APPROVED',
  'MUTATION_REQUIRES_APPROVAL',
  'COMMAND_FAMILY_DENIED',
  'PATH_OUT_OF_SCOPE',
  'REPO_BOUNDARY_VIOLATION'
] as const;

export type PolicyDecisionCode = (typeof policyDecisionCodes)[number];
export type PolicyClassification = 'allowed' | 'denied' | 'requires approval';

export type PolicyActionClass = 'read-only' | 'mutation';

export type PolicyApproval = {
  state: Extract<ApprovalState, 'approved' | 'rejected' | 'pending'>;
};

export type EvaluatePolicyInput = {
  runId: string;
  taskId?: string;
  actionClass: PolicyActionClass;
  commandFamily: string;
  targetPath?: string;
  decidedAt?: number;
  approval?: PolicyApproval;
};

export type PolicyEvaluatorConfig = {
  repoRoot: string;
  allowedCommandFamilies: readonly string[];
  allowedPathScopes: readonly string[];
  enforceRepoBoundary?: boolean;
  requireApprovalForMutation?: boolean;
};

export type PolicyEvaluationResult = {
  classification: PolicyClassification;
  code: PolicyDecisionCode;
  reasons: string[];
  record: PolicyDecisionRecord;
};

const normalizePosix = (value: string): string => value.split(path.sep).join('/');

const toAbsolutePosixPath = (repoRoot: string, candidatePath: string): string => {
  const absolutePath = path.isAbsolute(candidatePath) ? path.normalize(candidatePath) : path.resolve(repoRoot, candidatePath);
  return normalizePosix(path.normalize(absolutePath));
};

const toRelativePath = (repoRoot: string, candidatePath: string): { relativePath: string; escapesRepoRoot: boolean } => {
  const repoRootPosix = toAbsolutePosixPath(repoRoot, repoRoot);
  const targetPosix = toAbsolutePosixPath(repoRootPosix, candidatePath);
  const relative = normalizePosix(path.posix.relative(repoRootPosix, targetPosix));
  const escapesRepoRoot = relative === '..' || relative.startsWith('../');
  return {
    relativePath: relative === '' ? '.' : relative,
    escapesRepoRoot
  };
};

const inPathScope = (relativePath: string, allowedScopes: readonly string[]): boolean => {
  if (relativePath === '.') return true;
  return allowedScopes.some((scope) => {
    const normalizedScope = scope === '.' ? '.' : normalizePosix(scope).replace(/^\.\//, '').replace(/\/+$/, '');
    if (normalizedScope === '.') return true;
    return relativePath === normalizedScope || relativePath.startsWith(`${normalizedScope}/`);
  });
};

const toClassification = (policyState: PolicyState): PolicyClassification => {
  if (policyState === 'allow') return 'allowed';
  if (policyState === 'deny') return 'denied';
  return 'requires approval';
};

const buildDecisionRecord = (input: {
  runId: string;
  taskId?: string;
  policyState: PolicyState;
  approvalState: ApprovalState;
  reason: string;
  decidedAt: number;
}): PolicyDecisionRecord => ({
  ...createControlPlaneSchemaMetadata('policy-decision-record'),
  runId: input.runId,
  taskId: input.taskId,
  policyState: input.policyState,
  approvalState: input.approvalState,
  reason: input.reason,
  decidedAt: input.decidedAt
});

export const evaluatePolicyGate = (input: EvaluatePolicyInput, config: PolicyEvaluatorConfig): PolicyEvaluationResult => {
  const decidedAt = input.decidedAt ?? Date.now();
  const reasons: string[] = [];

  if (!config.allowedCommandFamilies.includes(input.commandFamily)) {
    const code: PolicyDecisionCode = 'COMMAND_FAMILY_DENIED';
    reasons.push(`command family ${input.commandFamily} is not allowed`);
    const record = buildDecisionRecord({
      runId: input.runId,
      taskId: input.taskId,
      policyState: 'deny',
      approvalState: 'not-required',
      reason: `${code}: ${reasons.join('; ')}`,
      decidedAt
    });
    return { classification: 'denied', code, reasons, record };
  }

  if (input.targetPath) {
    const target = toRelativePath(config.repoRoot, input.targetPath);
    if (config.enforceRepoBoundary !== false && target.escapesRepoRoot) {
      const code: PolicyDecisionCode = 'REPO_BOUNDARY_VIOLATION';
      reasons.push(`path ${input.targetPath} escapes configured repository root`);
      const record = buildDecisionRecord({
        runId: input.runId,
        taskId: input.taskId,
        policyState: 'deny',
        approvalState: 'not-required',
        reason: `${code}: ${reasons.join('; ')}`,
        decidedAt
      });
      return { classification: 'denied', code, reasons, record };
    }

    if (!inPathScope(target.relativePath, config.allowedPathScopes)) {
      const code: PolicyDecisionCode = 'PATH_OUT_OF_SCOPE';
      reasons.push(`path ${target.relativePath} is outside allowed scope`);
      const record = buildDecisionRecord({
        runId: input.runId,
        taskId: input.taskId,
        policyState: 'deny',
        approvalState: 'not-required',
        reason: `${code}: ${reasons.join('; ')}`,
        decidedAt
      });
      return { classification: 'denied', code, reasons, record };
    }
  }

  if (input.actionClass === 'read-only') {
    const code: PolicyDecisionCode = 'READ_ONLY_ALLOWED';
    reasons.push('read-only action is allowed without mutation approval');
    const record = buildDecisionRecord({
      runId: input.runId,
      taskId: input.taskId,
      policyState: 'allow',
      approvalState: 'not-required',
      reason: `${code}: ${reasons.join('; ')}`,
      decidedAt
    });
    return { classification: toClassification(record.policyState), code, reasons, record };
  }

  if (config.requireApprovalForMutation !== false && input.approval?.state !== 'approved') {
    const code: PolicyDecisionCode = 'MUTATION_REQUIRES_APPROVAL';
    reasons.push('mutation-bearing action requires explicit approval');
    const record = buildDecisionRecord({
      runId: input.runId,
      taskId: input.taskId,
      policyState: 'review-required',
      approvalState: input.approval?.state ?? 'pending',
      reason: `${code}: ${reasons.join('; ')}`,
      decidedAt
    });
    return { classification: toClassification(record.policyState), code, reasons, record };
  }

  const code: PolicyDecisionCode = 'MUTATION_APPROVED';
  reasons.push('mutation-bearing action is approved and allowed');
  const record = buildDecisionRecord({
    runId: input.runId,
    taskId: input.taskId,
    policyState: 'allow',
    approvalState: 'approved',
    reason: `${code}: ${reasons.join('; ')}`,
    decidedAt
  });
  return { classification: toClassification(record.policyState), code, reasons, record };
};
