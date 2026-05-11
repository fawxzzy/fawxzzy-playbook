import { describe, expect, it } from 'vitest';
import {
  buildWorkflowPackEnvironmentBridgePlan,
  buildWorkflowPackEnvironmentBridgeReport,
  type WorkflowPackEnvironmentBridgeInput
} from '../src/workflowPack/index.js';

const baseInput = (): WorkflowPackEnvironmentBridgeInput => ({
  schemaVersion: 'playbook.workflow-pack.environment-bridge.v1',
  workflowPackId: 'playbook.workflow-pack.reuse.v1',
  environmentName: 'protected_production',
  verificationGate: {
    mode: 'local_and_promotion_required',
    requiredEvidenceRefs: [
      '.playbook/promotion-receipt.json',
      '.playbook/local-verification-receipt.json'
    ],
    failurePolicy: 'block'
  },
  approvalPolicy: {
    mode: 'protected_environment',
    requiredApprovals: 1,
    approverRoles: ['release_owner']
  },
  requiredSecrets: [
    'ref://lifeline/secret/PLAYBOOK_RECEIPT_SIGNING_KEY',
    'ref://github/environment/PLAYBOOK_PUBLISH_TOKEN'
  ],
  secretRefsOnly: true,
  publishMode: 'publish_after_verification',
  deploymentMode: 'receipt_only',
  receiptRefs: [
    '.playbook/promotion-receipt.json',
    '.playbook/local-verification-receipt.json'
  ],
  consumerRules: [
    'Treat environment gates as approval and publish boundaries, not as verification truth.',
    'Reference secrets through provider-neutral refs instead of embedding raw values.',
    'Keep downstream projections read-only and preserve refs back to owner receipts.'
  ]
});

describe('workflow-pack environment bridge planner', () => {
  it('builds a deterministic implementation plan from the stable bridge report', () => {
    const report = buildWorkflowPackEnvironmentBridgeReport(baseInput());
    const plan = buildWorkflowPackEnvironmentBridgePlan(report);

    expect(plan).toEqual({
      schemaVersion: 'playbook.workflow-pack.environment-bridge.plan.v1',
      workflowPackId: 'playbook.workflow-pack.reuse.v1',
      environmentName: 'protected_production',
      status: 'ready',
      summary: {
        overview:
          'protected_production planning is ready for playbook.workflow-pack.reuse.v1 with deterministic, commandless implementation steps and preserved governance boundaries.',
        sourceReportStatus: 'ok',
        stepCount: 9,
        warningCount: 0,
        blockerCount: 0
      },
      sourceReport: {
        schemaVersion: 'playbook.workflow-pack.environment-bridge.report.v1',
        status: 'ok',
        verificationGateStatus: 'declared',
        approvalPolicyStatus: 'declared',
        publishMode: 'publish_after_verification',
        deploymentMode: 'receipt_only',
        warningCount: 0,
        blockerCount: 0
      },
      implementationSteps: [
        {
          id: 'verification-gate',
          phase: 'verification_gate',
          title: 'Validate verification gate evidence requirements',
          description:
            'Confirm protected_production preserves local_and_promotion_required verification and retains the required evidence refs before any publish or deployment work advances.',
          actionType: 'verify',
          dependsOn: [],
          evidenceRefs: [
            '.playbook/local-verification-receipt.json',
            '.playbook/promotion-receipt.json'
          ],
          blockedBy: []
        },
        {
          id: 'approval-policy',
          phase: 'approval_policy',
          title: 'Carry approval policy into consumer review boundaries',
          description:
            'Document protected_environment approval expectations for protected_production with 1 required approval slot(s) and stable approver roles.',
          actionType: 'review',
          dependsOn: ['verification-gate'],
          evidenceRefs: [],
          blockedBy: []
        },
        {
          id: 'secret-refs',
          phase: 'secret_refs',
          title: 'Map provider-neutral secret refs without materializing values',
          description:
            'Carry only provider-neutral secret refs into downstream configuration for playbook.workflow-pack.reuse.v1; raw secret values remain blocked.',
          actionType: 'configure',
          dependsOn: ['verification-gate'],
          evidenceRefs: [
            'ref://github/environment/PLAYBOOK_PUBLISH_TOKEN',
            'ref://lifeline/secret/PLAYBOOK_RECEIPT_SIGNING_KEY'
          ],
          blockedBy: []
        },
        {
          id: 'receipt-refs',
          phase: 'receipt_refs',
          title: 'Preserve receipt refs for verification and downstream handoff',
          description:
            'Keep the declared receipt refs available as downstream evidence and preserve them as the canonical receipt boundary.',
          actionType: 'verify',
          dependsOn: ['verification-gate'],
          evidenceRefs: [
            '.playbook/local-verification-receipt.json',
            '.playbook/promotion-receipt.json'
          ],
          blockedBy: []
        },
        {
          id: 'publish-mode',
          phase: 'publish_mode',
          title: 'Document publish posture from the bridge report',
          description:
            'Keep publish_after_verification as a documented planning boundary so publish posture remains visible in the plan instead of being hidden in implementation details.',
          actionType: 'document',
          dependsOn: ['verification-gate', 'approval-policy', 'secret-refs', 'receipt-refs'],
          evidenceRefs: [
            '.playbook/local-verification-receipt.json',
            '.playbook/promotion-receipt.json'
          ],
          blockedBy: []
        },
        {
          id: 'deployment-mode',
          phase: 'deployment_mode',
          title: 'Document deployment posture from the bridge report',
          description:
            'Treat receipt_only as a planning posture only and keep deployment boundaries explicit without generating execution artifacts.',
          actionType: 'document',
          dependsOn: ['publish-mode'],
          evidenceRefs: [
            '.playbook/local-verification-receipt.json',
            '.playbook/promotion-receipt.json'
          ],
          blockedBy: []
        },
        {
          id: 'consumer-rule-01',
          phase: 'consumer_rules',
          title: 'Review consumer rule 1',
          description: 'Treat environment gates as approval and publish boundaries, not as verification truth.',
          actionType: 'review',
          dependsOn: ['deployment-mode'],
          evidenceRefs: [
            '.playbook/local-verification-receipt.json',
            '.playbook/promotion-receipt.json'
          ],
          blockedBy: []
        },
        {
          id: 'consumer-rule-02',
          phase: 'consumer_rules',
          title: 'Review consumer rule 2',
          description: 'Reference secrets through provider-neutral refs instead of embedding raw values.',
          actionType: 'review',
          dependsOn: ['deployment-mode'],
          evidenceRefs: [
            '.playbook/local-verification-receipt.json',
            '.playbook/promotion-receipt.json'
          ],
          blockedBy: []
        },
        {
          id: 'consumer-rule-03',
          phase: 'consumer_rules',
          title: 'Review consumer rule 3',
          description: 'Keep downstream projections read-only and preserve refs back to owner receipts.',
          actionType: 'review',
          dependsOn: ['deployment-mode'],
          evidenceRefs: [
            '.playbook/local-verification-receipt.json',
            '.playbook/promotion-receipt.json'
          ],
          blockedBy: []
        }
      ],
      requiredApprovals: {
        mode: 'protected_environment',
        minimumApprovals: 1,
        approverRoles: ['release_owner']
      },
      requiredSecretRefs: [
        'ref://github/environment/PLAYBOOK_PUBLISH_TOKEN',
        'ref://lifeline/secret/PLAYBOOK_RECEIPT_SIGNING_KEY'
      ],
      requiredReceiptRefs: [
        '.playbook/local-verification-receipt.json',
        '.playbook/promotion-receipt.json'
      ],
      consumerRuleActions: [
        {
          rule: 'Treat environment gates as approval and publish boundaries, not as verification truth.',
          stepId: 'consumer-rule-01',
          action: 'Review and carry consumer rule 1 into downstream implementation guidance without generating execution artifacts.'
        },
        {
          rule: 'Reference secrets through provider-neutral refs instead of embedding raw values.',
          stepId: 'consumer-rule-02',
          action: 'Review and carry consumer rule 2 into downstream implementation guidance without generating execution artifacts.'
        },
        {
          rule: 'Keep downstream projections read-only and preserve refs back to owner receipts.',
          stepId: 'consumer-rule-03',
          action: 'Review and carry consumer rule 3 into downstream implementation guidance without generating execution artifacts.'
        }
      ],
      warnings: [],
      blockers: [],
      boundaries: {
        mutationSurface: 'read_only_planner',
        forbids: [
          'no_cli_command',
          'no_docs_commands',
          'no_workflow_writes',
          'no_github_actions_mutation',
          'no_lifeline_execution_changes',
          'no_runtime_writes',
          'no_repo_scanning',
          'no_secret_materialization'
        ]
      }
    });
  });

  it('stays deterministic when the report ref ordering changes', () => {
    const first = buildWorkflowPackEnvironmentBridgePlan(buildWorkflowPackEnvironmentBridgeReport(baseInput()));
    const second = buildWorkflowPackEnvironmentBridgePlan(
      buildWorkflowPackEnvironmentBridgeReport({
        ...baseInput(),
        verificationGate: {
          ...baseInput().verificationGate,
          requiredEvidenceRefs: [...(baseInput().verificationGate?.requiredEvidenceRefs ?? [])].reverse()
        },
        approvalPolicy: {
          ...baseInput().approvalPolicy,
          approverRoles: [...(baseInput().approvalPolicy?.approverRoles ?? [])].reverse()
        },
        requiredSecrets: [...(baseInput().requiredSecrets ?? [])].reverse(),
        receiptRefs: [...(baseInput().receiptRefs ?? [])].reverse()
      })
    );

    expect(first).toEqual(second);
  });

  it('propagates report warnings into a needs_review plan with explicit receipt action steps', () => {
    const plan = buildWorkflowPackEnvironmentBridgePlan(
      buildWorkflowPackEnvironmentBridgeReport({
        ...baseInput(),
        deploymentMode: 'external_consumer_handoff'
      })
    );

    expect(plan.status).toBe('needs_review');
    expect(plan.warnings).toEqual([
      {
        code: 'consumer-handoff-receipt-gap',
        field: 'receiptRefs',
        message:
          'external_consumer_handoff should preserve at least one downstream handoff receipt ref beyond the verification gate receipts.'
      }
    ]);
    expect(plan.implementationSteps.find((step) => step.id === 'receipt-refs')?.actionType).toBe('verify');
    expect(plan.blockers).toEqual([]);
  });

  it('propagates report blockers and keeps blocked phases explicit without introducing execution claims', () => {
    const blockedReport = buildWorkflowPackEnvironmentBridgeReport({
      workflowPackId: 'playbook.workflow-pack.reuse.v1',
      environmentName: 'protected_production',
      approvalPolicy: {
        mode: 'manual_release_gate',
        requiredApprovals: 0,
        approverRoles: []
      },
      requiredSecrets: ['ghp_live_secret'],
      secretRefsOnly: false,
      publishMode: 'publish_after_verification',
      deploymentMode: 'external_consumer_handoff',
      receiptRefs: ['C:\\ATLAS\\receipts\\publish.json'],
      consumerRules: [],
      workflowFile: '.github/workflows/publish.yml'
    });

    const plan = buildWorkflowPackEnvironmentBridgePlan(blockedReport);

    expect(plan.status).toBe('blocked');
    expect(plan.summary.sourceReportStatus).toBe('blocked');
    expect(plan.blockers).toEqual(expect.arrayContaining(blockedReport.blockers));
    expect(plan.blockers.some((issue) => issue.code === 'raw-secret-value')).toBe(true);
    expect(plan.blockers.some((issue) => issue.field === 'verificationGate')).toBe(true);
    expect(plan.implementationSteps.find((step) => step.id === 'secret-refs')?.blockedBy).toEqual(
      expect.arrayContaining([
        'missing-field:requiredSecrets',
        'raw-secret-value:requiredSecrets[0]',
        'secret-refs-only-violation:secretRefsOnly'
      ])
    );
  });
});
