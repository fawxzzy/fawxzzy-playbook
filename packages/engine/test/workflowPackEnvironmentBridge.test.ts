import { describe, expect, it } from 'vitest';
import {
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

describe('workflow-pack environment bridge report', () => {
  it('builds a deterministic report from explicit bridge input', () => {
    const report = buildWorkflowPackEnvironmentBridgeReport(baseInput());

    expect(report).toEqual({
      schemaVersion: 'playbook.workflow-pack.environment-bridge.report.v1',
      workflowPackId: 'playbook.workflow-pack.reuse.v1',
      environmentName: 'protected_production',
      summary: {
        status: 'ok',
        overview:
          'protected_production bridges playbook.workflow-pack.reuse.v1 through local_and_promotion_required verification, protected_environment approval, publish_after_verification publish, and receipt_only deployment.',
        verificationGateStatus: 'declared',
        approvalPolicyStatus: 'declared',
        publishPosture: 'publish_after_verification',
        deploymentPosture: 'receipt_only',
        secretRefSafety: 'refs_only',
        receiptRefStatus: 'complete',
        consumerRuleStatus: 'present',
        warningCount: 0,
        blockerCount: 0
      },
      verificationGate: {
        mode: 'local_and_promotion_required',
        requiredEvidenceRefs: [
          '.playbook/local-verification-receipt.json',
          '.playbook/promotion-receipt.json'
        ],
        failurePolicy: 'block'
      },
      approvalPolicy: {
        mode: 'protected_environment',
        requiredApprovals: 1,
        approverRoles: ['release_owner']
      },
      publishMode: 'publish_after_verification',
      deploymentMode: 'receipt_only',
      requiredSecrets: [
        'ref://github/environment/PLAYBOOK_PUBLISH_TOKEN',
        'ref://lifeline/secret/PLAYBOOK_RECEIPT_SIGNING_KEY'
      ],
      receiptRefs: [
        '.playbook/local-verification-receipt.json',
        '.playbook/promotion-receipt.json'
      ],
      consumerRules: [
        'Treat environment gates as approval and publish boundaries, not as verification truth.',
        'Reference secrets through provider-neutral refs instead of embedding raw values.',
        'Keep downstream projections read-only and preserve refs back to owner receipts.'
      ],
      warnings: [],
      blockers: []
    });
  });

  it('returns the same report regardless of ref ordering in the input contract', () => {
    const first = buildWorkflowPackEnvironmentBridgeReport(baseInput());
    const second = buildWorkflowPackEnvironmentBridgeReport({
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
    });

    expect(first).toEqual(second);
  });

  it('emits a warning when external consumer handoff lacks a downstream handoff receipt ref', () => {
    const report = buildWorkflowPackEnvironmentBridgeReport({
      ...baseInput(),
      deploymentMode: 'external_consumer_handoff'
    });

    expect(report.summary.status).toBe('warning');
    expect(report.summary.receiptRefStatus).toBe('consumer_handoff_gap');
    expect(report.warnings).toEqual([
      {
        code: 'consumer-handoff-receipt-gap',
        field: 'receiptRefs',
        message:
          'external_consumer_handoff should preserve at least one downstream handoff receipt ref beyond the verification gate receipts.'
      }
    ]);
    expect(report.blockers).toEqual([]);
  });

  it('fails closed when bridge input embeds raw secrets, omits the verification gate, or claims workflow availability', () => {
    const report = buildWorkflowPackEnvironmentBridgeReport({
      workflowPackId: 'playbook.workflow-pack.reuse.v1',
      environmentName: 'protected_production',
      approvalPolicy: {
        mode: 'manual_release_gate',
        requiredApprovals: 0,
        approverRoles: []
      },
      requiredSecrets: [
        'ghp_live_secret',
        'ref://github/environment/PLAYBOOK_PUBLISH_TOKEN'
      ],
      secretRefsOnly: false,
      publishMode: 'publish_after_verification',
      deploymentMode: 'external_consumer_handoff',
      receiptRefs: ['C:\\ATLAS\\receipts\\publish.json'],
      consumerRules: [],
      workflowFile: '.github/workflows/publish.yml',
      updatedAt: '2026-05-09T14:00:00Z'
    });

    expect(report.summary.status).toBe('blocked');
    expect(report.workflowPackId).toBe('playbook.workflow-pack.reuse.v1');
    expect(report.summary.verificationGateStatus).toBe('missing');
    expect(report.summary.secretRefSafety).toBe('raw_secret_detected');
    expect(report.summary.receiptRefStatus).toBe('missing');
    expect(report.requiredSecrets).toEqual([
      'ref://github/environment/PLAYBOOK_PUBLISH_TOKEN'
    ]);
    expect(report.receiptRefs).toEqual([]);
    expect(report.blockers).toEqual(expect.arrayContaining([
      {
        code: 'command-availability-claim',
        field: 'workflowFile',
        message: 'Environment bridge input must not claim command or workflow availability via "workflowFile".'
      },
      {
        code: 'unstable-timestamp',
        field: 'updatedAt',
        message: 'Environment bridge input must not include unstable field "updatedAt".'
      },
      {
        code: 'unstable-timestamp',
        field: 'updatedAt',
        message: 'Environment bridge input must not depend on unstable timestamp content at "updatedAt".'
      },
      {
        code: 'raw-secret-value',
        field: 'requiredSecrets[0]',
        message: 'requiredSecrets[0] must use a provider-neutral secret ref instead of a raw secret value.'
      },
      {
        code: 'secret-refs-only-violation',
        field: 'secretRefsOnly',
        message: 'secretRefsOnly must remain true for workflow-pack environment bridges.'
      },
      {
        code: 'missing-field',
        field: 'verificationGate',
        message: 'Environment bridge input must include verificationGate.'
      },
      {
        code: 'absolute-path',
        field: 'receiptRefs[0]',
        message: 'Environment bridge input must not contain a local absolute path at "receiptRefs[0]".'
      }
    ]));
  });
});
