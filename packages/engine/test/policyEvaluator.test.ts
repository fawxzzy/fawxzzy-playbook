import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluatePolicyGate } from '../src/policy/evaluator.js';

const repoRoot = path.resolve('/workspace/playbook');
const baseConfig = {
  repoRoot,
  allowedCommandFamilies: ['query', 'verify', 'apply'],
  allowedRemediationScopes: ['workspace', 'module:engine'],
  allowedPathScopes: ['packages/engine', '.playbook']
} as const;

describe('policy evaluator', () => {
  it('allows read-only tasks without mutation approval', () => {
    const result = evaluatePolicyGate(
      {
        runId: 'run_1',
        taskId: 'task_read',
        actionClass: 'read-only',
        commandFamily: 'query',
        targetPath: 'packages/engine/src/index.ts',
        decidedAt: 123
      },
      baseConfig
    );

    expect(result.classification).toBe('allowed');
    expect(result.code).toBe('READ_ONLY_ALLOWED');
    expect(result.record.policyState).toBe('allow');
    expect(result.record.approvalState).toBe('not-required');
    expect(result.record.reason).toContain('READ_ONLY_ALLOWED');
  });

  it('marks mutation-bearing tasks as requiring approval when approval is missing', () => {
    const result = evaluatePolicyGate(
      {
        runId: 'run_1',
        taskId: 'task_mutation',
        actionClass: 'mutation',
        commandFamily: 'apply',
        targetPath: 'packages/engine/src/policy/evaluator.ts',
        decidedAt: 123
      },
      baseConfig
    );

    expect(result.classification).toBe('requires_approval');
    expect(result.code).toBe('MUTATION_REQUIRES_APPROVAL');
    expect(result.record.policyState).toBe('review-required');
    expect(result.record.approvalState).toBe('pending');
    expect(result.record.reason).toContain('MUTATION_REQUIRES_APPROVAL');
  });

  it('denies out-of-scope actions deterministically', () => {
    const result = evaluatePolicyGate(
      {
        runId: 'run_1',
        taskId: 'task_scope',
        actionClass: 'read-only',
        commandFamily: 'query',
        targetPath: 'docs/PLAYBOOK_PRODUCT_ROADMAP.md',
        decidedAt: 123
      },
      baseConfig
    );

    expect(result.classification).toBe('denied');
    expect(result.code).toBe('PATH_OUT_OF_SCOPE');
    expect(result.record.policyState).toBe('deny');
    expect(result.record.reason).toBe('PATH_OUT_OF_SCOPE: path docs/PLAYBOOK_PRODUCT_ROADMAP.md is outside allowed scope');
  });

  it('denies paths that escape repository boundaries', () => {
    const result = evaluatePolicyGate(
      {
        runId: 'run_1',
        taskId: 'task_boundary',
        actionClass: 'mutation',
        commandFamily: 'apply',
        targetPath: '../outside.txt',
        decidedAt: 123
      },
      baseConfig
    );

    expect(result.classification).toBe('denied');
    expect(result.code).toBe('REPO_BOUNDARY_VIOLATION');
    expect(result.record.reason).toContain('REPO_BOUNDARY_VIOLATION');
  });

  it('denies disallowed remediation scope deterministically', () => {
    const result = evaluatePolicyGate(
      {
        runId: 'run_1',
        taskId: 'task_scope_denied',
        actionClass: 'read-only',
        commandFamily: 'verify',
        remediationScope: 'module:cli',
        targetPath: 'packages/engine/src/policy/evaluator.ts',
        decidedAt: 123
      },
      baseConfig
    );

    expect(result.classification).toBe('denied');
    expect(result.code).toBe('REMEDIATION_SCOPE_DENIED');
    expect(result.record.policyState).toBe('deny');
    expect(result.record.reason).toBe('REMEDIATION_SCOPE_DENIED: remediation scope module:cli is not allowed');
  });

  it('denies mutation tasks when approval is explicitly rejected', () => {
    const result = evaluatePolicyGate(
      {
        runId: 'run_1',
        taskId: 'task_rejected_mutation',
        actionClass: 'mutation',
        commandFamily: 'apply',
        targetPath: 'packages/engine/src/policy/evaluator.ts',
        approval: { state: 'rejected' },
        decidedAt: 123
      },
      baseConfig
    );

    expect(result.classification).toBe('denied');
    expect(result.code).toBe('MUTATION_APPROVAL_REJECTED');
    expect(result.record.policyState).toBe('deny');
    expect(result.record.approvalState).toBe('rejected');
    expect(result.record.reason).toBe('MUTATION_APPROVAL_REJECTED: mutation-bearing action approval was explicitly rejected');
  });

  it('allows approved mutation tasks and emits deterministic reason code', () => {
    const result = evaluatePolicyGate(
      {
        runId: 'run_1',
        taskId: 'task_approved_mutation',
        actionClass: 'mutation',
        commandFamily: 'apply',
        targetPath: 'packages/engine/src/policy/evaluator.ts',
        approval: { state: 'approved' },
        decidedAt: 123
      },
      baseConfig
    );

    expect(result.classification).toBe('allowed');
    expect(result.code).toBe('MUTATION_APPROVED');
    expect(result.record.policyState).toBe('allow');
    expect(result.record.approvalState).toBe('approved');
    expect(result.record.reason).toBe('MUTATION_APPROVED: mutation-bearing action is approved and allowed');
  });
});
