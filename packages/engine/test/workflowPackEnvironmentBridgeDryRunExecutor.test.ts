import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildWorkflowPackEnvironmentBridgeDryRunReceipt,
  type WorkflowPackEnvironmentBridgeExecutorContract
} from '../src/workflowPack/index.js';

const baseContract = (): WorkflowPackEnvironmentBridgeExecutorContract => ({
  schemaVersion: 'playbook.workflow-pack.environment-bridge.executor.v1',
  workflowPackId: 'playbook.workflow-pack.reuse.v1',
  environmentName: 'protected_production',
  sourcePlanRef: 'exports/playbook.workflow-pack.environment-bridge.plan.example.v1.json',
  executionMode: 'dry_run',
  mutationPolicy: {
    mode: 'review_gated_apply',
    allowApply: false,
    requireExplicitTargets: true,
    requireReceiptEvidence: true
  },
  approvalRequired: true,
  allowedMutationTargets: [
    'consumer_repo.receipt_reference_manifest',
    'consumer_repo.environment_gate_configuration',
    'consumer_repo.environment_bridge_projection'
  ],
  forbiddenMutationTargets: [
    'raw_secret_values',
    'secret_materialization',
    'runtime_state',
    'lifeline_execution',
    'local_absolute_paths'
  ],
  requiredSecretRefs: [
    'ref://lifeline/secret/PLAYBOOK_RECEIPT_SIGNING_KEY',
    'ref://github/environment/PLAYBOOK_PUBLISH_TOKEN'
  ],
  requiredReceiptRefs: [
    '.playbook/promotion-receipt.json',
    '.playbook/local-verification-receipt.json'
  ],
  preflightChecks: [
    {
      id: 'preflight-verification-gate',
      title: 'Verify required bridge receipt evidence remains present',
      required: true,
      evidenceRefs: [
        '.playbook/local-verification-receipt.json',
        '.playbook/promotion-receipt.json'
      ],
      blocksApply: true
    },
    {
      id: 'preflight-approval-policy',
      title: 'Confirm approval policy remains explicit before any apply request',
      required: true,
      evidenceRefs: [
        'exports/playbook.workflow-pack.environment-bridge.plan.example.v1.json'
      ],
      blocksApply: true
    },
    {
      id: 'preflight-secret-refs',
      title: 'Confirm provider-neutral secret refs remain refs only',
      required: true,
      evidenceRefs: [
        'ref://github/environment/PLAYBOOK_PUBLISH_TOKEN',
        'ref://lifeline/secret/PLAYBOOK_RECEIPT_SIGNING_KEY'
      ],
      blocksApply: true
    },
    {
      id: 'preflight-receipt-refs',
      title: 'Confirm receipt references remain explicit and repo-relative',
      required: true,
      evidenceRefs: [
        '.playbook/local-verification-receipt.json',
        '.playbook/promotion-receipt.json'
      ],
      blocksApply: true
    }
  ],
  executionSteps: [
    {
      id: 'review-consumer-projection-targets',
      title: 'Review consumer projection targets before any future executor implementation',
      intent: 'Keep target surfaces explicit and reviewable before any environment bridge projection exists.',
      mutationTarget: 'consumer_repo.environment_bridge_projection',
      appliesInModes: ['dry_run', 'plan_only', 'apply_requested'],
      dependsOn: ['preflight-verification-gate', 'preflight-secret-refs'],
      evidenceRefs: [
        'exports/playbook.workflow-pack.environment-bridge.plan.example.v1.json'
      ]
    },
    {
      id: 'review-environment-gate-configuration',
      title: 'Review environment gate configuration boundaries',
      intent: 'Preserve approval and gate semantics as explicit contract truth instead of hidden provider behavior.',
      mutationTarget: 'consumer_repo.environment_gate_configuration',
      appliesInModes: ['dry_run', 'plan_only', 'apply_requested'],
      dependsOn: ['preflight-verification-gate', 'preflight-approval-policy'],
      evidenceRefs: [
        '.playbook/local-verification-receipt.json',
        '.playbook/promotion-receipt.json'
      ]
    },
    {
      id: 'review-receipt-reference-manifest',
      title: 'Review downstream receipt-reference preservation requirements',
      intent: 'Keep receipt ownership explicit in any future projection layer.',
      mutationTarget: 'consumer_repo.receipt_reference_manifest',
      appliesInModes: ['dry_run', 'plan_only', 'apply_requested'],
      dependsOn: ['preflight-receipt-refs'],
      evidenceRefs: [
        '.playbook/local-verification-receipt.json',
        '.playbook/promotion-receipt.json'
      ]
    },
    {
      id: 'validate-executor-receipt-contract',
      title: 'Validate the executor receipt contract before any future apply surface exists',
      intent: 'Make receipt semantics inspectable before executor implementation is introduced.',
      mutationTarget: 'consumer_repo.receipt_reference_manifest',
      appliesInModes: ['dry_run', 'plan_only', 'apply_requested'],
      dependsOn: [
        'review-consumer-projection-targets',
        'review-environment-gate-configuration',
        'review-receipt-reference-manifest'
      ],
      evidenceRefs: [
        'exports/playbook.workflow-pack.environment-bridge.executor-receipt.example.v1.json'
      ]
    }
  ],
  rollbackPlan: {
    strategy: 'Restore the last committed consumer projection and preserve all owner receipts if a future apply-requested run is rejected or rolled back.',
    steps: [
      'Preserve the source plan and owner receipt refs before any future mutation.',
      'Restore the last committed consumer projection if a future apply-requested run is rejected.',
      'Record rollback evidence in a future executor receipt instead of mutating owner truth.'
    ]
  },
  receiptRequirements: {
    requiredStatuses: ['blocked', 'dry_run_complete', 'applied'],
    requiredFields: [
      'status',
      'completedSteps',
      'skippedSteps',
      'mutationSummary',
      'receiptRefs'
    ],
    requiredEvidenceRefs: [
      'exports/playbook.workflow-pack.environment-bridge.plan.example.v1.json',
      '.playbook/local-verification-receipt.json',
      '.playbook/promotion-receipt.json'
    ],
    requiredReceiptRefs: [
      '.playbook/local-verification-receipt.json',
      '.playbook/promotion-receipt.json'
    ]
  },
  boundaries: {
    mutationSurface: 'contract_only_executor_definition',
    forbids: [
      'no_executor_implementation',
      'no_cli_command',
      'no_docs_commands',
      'no_github_actions_mutation',
      'no_workflow_yaml_generation',
      'no_lifeline_execution_changes',
      'no_runtime_writes',
      'no_secret_materialization'
    ]
  }
});

const listRelativeFiles = (root: string): string[] => {
  const results: string[] = [];
  const walk = (current: string) => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else {
        results.push(path.relative(root, entryPath).replace(/\\/g, '/'));
      }
    }
  };
  walk(root);
  return results.sort((left, right) => left.localeCompare(right));
};

describe('workflow-pack environment bridge dry-run executor', () => {
  it('builds a deterministic dry-run receipt without mutating targets', () => {
    const receipt = buildWorkflowPackEnvironmentBridgeDryRunReceipt(baseContract());

    expect(receipt.status).toBe('dry_run_complete');
    expect(receipt.executionMode).toBe('dry_run');
    expect(receipt.completedSteps).toEqual([
      'preflight-verification-gate',
      'preflight-approval-policy',
      'preflight-secret-refs',
      'preflight-receipt-refs',
      'review-consumer-projection-targets',
      'review-environment-gate-configuration',
      'review-receipt-reference-manifest',
      'validate-executor-receipt-contract'
    ]);
    expect(receipt.skippedSteps).toEqual([]);
    expect(receipt.blockers).toEqual([]);
    expect(receipt.warnings).toEqual([]);
    expect(receipt.mutationSummary).toEqual({
      attempted: false,
      appliedTargets: [],
      skippedTargets: [
        'consumer_repo.environment_bridge_projection',
        'consumer_repo.environment_gate_configuration',
        'consumer_repo.receipt_reference_manifest'
      ],
      appliedCount: 0
    });
    expect(receipt.receiptRefs).toEqual([
      'exports/playbook.workflow-pack.environment-bridge.executor.example.v1.json',
      'exports/playbook.workflow-pack.environment-bridge.plan.example.v1.json',
      '.playbook/local-verification-receipt.json',
      '.playbook/promotion-receipt.json'
    ]);
  });

  it('blocks apply_requested when approvalRequired is false and never mutates anything', () => {
    const receipt = buildWorkflowPackEnvironmentBridgeDryRunReceipt({
      ...baseContract(),
      executionMode: 'apply_requested',
      approvalRequired: false
    });

    expect(receipt.status).toBe('blocked');
    expect(receipt.executionMode).toBe('apply_requested');
    expect(receipt.completedSteps).toEqual([]);
    expect(receipt.skippedSteps).toEqual([
      'preflight-verification-gate',
      'preflight-approval-policy',
      'preflight-secret-refs',
      'preflight-receipt-refs',
      'review-consumer-projection-targets',
      'review-environment-gate-configuration',
      'review-receipt-reference-manifest',
      'validate-executor-receipt-contract'
    ]);
    expect(receipt.blockers).toEqual(
      expect.arrayContaining([
        {
          code: 'missing-approval',
          field: 'approvalRequired',
          message:
            'apply_requested dry-run execution requires approvalRequired=true before an apply path can be previewed.'
        }
      ])
    );
    expect(receipt.mutationSummary.attempted).toBe(false);
    expect(receipt.mutationSummary.appliedCount).toBe(0);
    expect(receipt.mutationSummary.appliedTargets).toEqual([]);
  });

  it('surfaces raw secrets, absolute paths, and workflow claims as blockers', () => {
    const receipt = buildWorkflowPackEnvironmentBridgeDryRunReceipt({
      ...baseContract(),
      requiredSecretRefs: ['ghp_live_secret'],
      requiredReceiptRefs: ['C:\\ATLAS\\repos\\fawxzzy-playbook\\.playbook\\promotion-receipt.json'],
      workflowFile: '.github/workflows/publish.yml',
      generatedAt: '2026-05-11T00:00:00.000Z'
    });

    expect(receipt.status).toBe('blocked');
    expect(receipt.blockers).toEqual(
      expect.arrayContaining([
        {
          code: 'raw-secret-value',
          field: 'requiredSecretRefs[0]',
          message:
            'requiredSecretRefs[0] must use a provider-neutral secret ref instead of a raw secret value.'
        },
        {
          code: 'absolute-path',
          field: 'requiredReceiptRefs[0]',
          message: 'requiredReceiptRefs[0] must not contain a local absolute path.'
        },
        {
          code: 'workflow-availability-claim',
          field: 'workflowFile',
          message: 'Dry-run executor input must not claim workflow availability via "workflowFile".'
        },
        {
          code: 'unstable-timestamp',
          field: 'generatedAt',
          message: 'Dry-run executor input must not include unstable field "generatedAt".'
        }
      ])
    );
  });

  it('stays deterministic when refs and targets arrive in a different order', () => {
    const first = buildWorkflowPackEnvironmentBridgeDryRunReceipt(baseContract());
    const second = buildWorkflowPackEnvironmentBridgeDryRunReceipt({
      ...baseContract(),
      allowedMutationTargets: [...(baseContract().allowedMutationTargets ?? [])].reverse(),
      forbiddenMutationTargets: [...(baseContract().forbiddenMutationTargets ?? [])].reverse(),
      requiredSecretRefs: [...(baseContract().requiredSecretRefs ?? [])].reverse(),
      requiredReceiptRefs: [...(baseContract().requiredReceiptRefs ?? [])].reverse(),
      preflightChecks: [...(baseContract().preflightChecks ?? [])].map((check) => ({
        ...check,
        evidenceRefs: [...(check.evidenceRefs ?? [])].reverse()
      })),
      executionSteps: [...(baseContract().executionSteps ?? [])].map((step) => ({
        ...step,
        evidenceRefs: [...(step.evidenceRefs ?? [])].reverse()
      }))
    });

    expect(first).toEqual(second);
  });

  it('does not write runtime files while building the receipt', () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'playbook-workflow-pack-environment-bridge-dry-run-')
    );
    const sentinelPath = path.join(tempRoot, 'sentinel.txt');
    fs.writeFileSync(sentinelPath, 'unchanged\n', 'utf8');
    const before = listRelativeFiles(tempRoot);

    try {
      const receipt = buildWorkflowPackEnvironmentBridgeDryRunReceipt(baseContract());
      const after = listRelativeFiles(tempRoot);

      expect(receipt.status).toBe('dry_run_complete');
      expect(after).toEqual(before);
      expect(fs.readFileSync(sentinelPath, 'utf8')).toBe('unchanged\n');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
