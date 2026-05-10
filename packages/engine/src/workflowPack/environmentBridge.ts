export const WORKFLOW_PACK_ENVIRONMENT_BRIDGE_REPORT_SCHEMA_VERSION =
  'playbook.workflow-pack.environment-bridge.report.v1' as const;

export type WorkflowPackEnvironmentBridgeVerificationMode =
  | 'local_verification_required'
  | 'local_and_promotion_required';

export type WorkflowPackEnvironmentBridgeVerificationFailurePolicy = 'block';

export type WorkflowPackEnvironmentBridgeApprovalPolicyMode =
  | 'protected_environment'
  | 'manual_release_gate';

export type WorkflowPackEnvironmentBridgePublishMode =
  | 'publish_after_verification'
  | 'promotion_only';

export type WorkflowPackEnvironmentBridgeDeploymentMode =
  | 'receipt_only'
  | 'external_consumer_handoff';

export type WorkflowPackEnvironmentBridgeReportVerificationMode =
  | WorkflowPackEnvironmentBridgeVerificationMode
  | 'unknown';

export type WorkflowPackEnvironmentBridgeReportVerificationFailurePolicy =
  | WorkflowPackEnvironmentBridgeVerificationFailurePolicy
  | 'unknown';

export type WorkflowPackEnvironmentBridgeReportApprovalPolicyMode =
  | WorkflowPackEnvironmentBridgeApprovalPolicyMode
  | 'unknown';

export type WorkflowPackEnvironmentBridgeReportPublishMode =
  | WorkflowPackEnvironmentBridgePublishMode
  | 'unknown';

export type WorkflowPackEnvironmentBridgeReportDeploymentMode =
  | WorkflowPackEnvironmentBridgeDeploymentMode
  | 'unknown';

export type WorkflowPackEnvironmentBridgeReportStatus = 'ok' | 'warning' | 'blocked';
export type WorkflowPackEnvironmentBridgeVerificationGateStatus = 'declared' | 'missing' | 'receipt_gap';
export type WorkflowPackEnvironmentBridgeApprovalPolicyStatus = 'declared' | 'missing';
export type WorkflowPackEnvironmentBridgeSecretRefSafety = 'refs_only' | 'mixed_or_invalid' | 'raw_secret_detected';
export type WorkflowPackEnvironmentBridgeReceiptRefStatus =
  | 'complete'
  | 'missing'
  | 'verification_gap'
  | 'consumer_handoff_gap';
export type WorkflowPackEnvironmentBridgeConsumerRuleStatus = 'present' | 'missing';

export type WorkflowPackEnvironmentBridgeIssueCode =
  | 'absolute-path'
  | 'command-availability-claim'
  | 'consumer-handoff-receipt-gap'
  | 'invalid-value'
  | 'missing-field'
  | 'raw-secret-value'
  | 'secret-refs-only-violation'
  | 'unstable-timestamp'
  | 'verification-receipt-gap';

export type WorkflowPackEnvironmentBridgeIssue = {
  code: WorkflowPackEnvironmentBridgeIssueCode;
  message: string;
  field?: string;
};

export type WorkflowPackEnvironmentBridgeInput = {
  schemaVersion?: string;
  workflowPackId?: string;
  environmentName?: string;
  verificationGate?: {
    mode?: WorkflowPackEnvironmentBridgeVerificationMode | string;
    requiredEvidenceRefs?: string[];
    failurePolicy?: WorkflowPackEnvironmentBridgeVerificationFailurePolicy | string;
  } & Record<string, unknown>;
  approvalPolicy?: {
    mode?: WorkflowPackEnvironmentBridgeApprovalPolicyMode | string;
    requiredApprovals?: number;
    approverRoles?: string[];
  } & Record<string, unknown>;
  requiredSecrets?: string[];
  secretRefsOnly?: boolean;
  publishMode?: WorkflowPackEnvironmentBridgePublishMode | string;
  deploymentMode?: WorkflowPackEnvironmentBridgeDeploymentMode | string;
  receiptRefs?: string[];
  consumerRules?: string[];
} & Record<string, unknown>;

export type WorkflowPackEnvironmentBridgeReport = {
  schemaVersion: typeof WORKFLOW_PACK_ENVIRONMENT_BRIDGE_REPORT_SCHEMA_VERSION;
  workflowPackId: string;
  environmentName: string;
  summary: {
    status: WorkflowPackEnvironmentBridgeReportStatus;
    overview: string;
    verificationGateStatus: WorkflowPackEnvironmentBridgeVerificationGateStatus;
    approvalPolicyStatus: WorkflowPackEnvironmentBridgeApprovalPolicyStatus;
    publishPosture: WorkflowPackEnvironmentBridgeReportPublishMode;
    deploymentPosture: WorkflowPackEnvironmentBridgeReportDeploymentMode;
    secretRefSafety: WorkflowPackEnvironmentBridgeSecretRefSafety;
    receiptRefStatus: WorkflowPackEnvironmentBridgeReceiptRefStatus;
    consumerRuleStatus: WorkflowPackEnvironmentBridgeConsumerRuleStatus;
    warningCount: number;
    blockerCount: number;
  };
  verificationGate: {
    mode: WorkflowPackEnvironmentBridgeReportVerificationMode;
    requiredEvidenceRefs: string[];
    failurePolicy: WorkflowPackEnvironmentBridgeReportVerificationFailurePolicy;
  };
  approvalPolicy: {
    mode: WorkflowPackEnvironmentBridgeReportApprovalPolicyMode;
    requiredApprovals: number;
    approverRoles: string[];
  };
  publishMode: WorkflowPackEnvironmentBridgeReportPublishMode;
  deploymentMode: WorkflowPackEnvironmentBridgeReportDeploymentMode;
  requiredSecrets: string[];
  receiptRefs: string[];
  consumerRules: string[];
  warnings: WorkflowPackEnvironmentBridgeIssue[];
  blockers: WorkflowPackEnvironmentBridgeIssue[];
};

const FORBIDDEN_CLAIM_FIELDS = new Set([
  'command',
  'commands',
  'commandAvailability',
  'commandStatus',
  'availability',
  'workflow',
  'workflowFile',
  'workflowPath',
  'workflowName'
]);

const FORBIDDEN_UNSTABLE_FIELD_NAMES = new Set([
  'generatedAt',
  'createdAt',
  'updatedAt',
  'timestamp',
  'absolutePath',
  'localPath',
  'workspaceRoot'
]);

const DEFAULT_WORKFLOW_PACK_ID = 'invalid-workflow-pack';
const DEFAULT_ENVIRONMENT_NAME = 'invalid-environment';

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isFinitePositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

const isAbsolutePathLike = (value: string): boolean =>
  /^[A-Za-z]:[\\/]/.test(value) ||
  /^\\\\/.test(value) ||
  /^\/(?:Users|home|var|tmp)\//.test(value);

const isIsoDateTime = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value);

const normalizeText = (value: string): string => value.trim();
const normalizeRef = (value: string): string => normalizeText(value).replace(/\\/g, '/');

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const compareIssues = (
  left: WorkflowPackEnvironmentBridgeIssue,
  right: WorkflowPackEnvironmentBridgeIssue
): number =>
  left.code.localeCompare(right.code) ||
  (left.field ?? '').localeCompare(right.field ?? '') ||
  left.message.localeCompare(right.message);

const sortUnique = (values: string[]): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const uniquePreservingOrder = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
};

const dedupeIssues = (issues: WorkflowPackEnvironmentBridgeIssue[]): WorkflowPackEnvironmentBridgeIssue[] => {
  const seen = new Set<string>();
  return [...issues]
    .sort(compareIssues)
    .filter((issue) => {
      const key = `${issue.code}|${issue.field ?? ''}|${issue.message}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
};

const addIssue = (
  issues: WorkflowPackEnvironmentBridgeIssue[],
  issue: WorkflowPackEnvironmentBridgeIssue
): void => {
  issues.push(issue);
};

const isKnownVerificationMode = (
  value: unknown
): value is WorkflowPackEnvironmentBridgeVerificationMode =>
  value === 'local_verification_required' || value === 'local_and_promotion_required';

const isKnownVerificationFailurePolicy = (
  value: unknown
): value is WorkflowPackEnvironmentBridgeVerificationFailurePolicy => value === 'block';

const isKnownApprovalPolicyMode = (
  value: unknown
): value is WorkflowPackEnvironmentBridgeApprovalPolicyMode =>
  value === 'protected_environment' || value === 'manual_release_gate';

const isKnownPublishMode = (value: unknown): value is WorkflowPackEnvironmentBridgePublishMode =>
  value === 'publish_after_verification' || value === 'promotion_only';

const isKnownDeploymentMode = (value: unknown): value is WorkflowPackEnvironmentBridgeDeploymentMode =>
  value === 'receipt_only' || value === 'external_consumer_handoff';

const scanInputBoundaries = (
  value: unknown,
  currentPath: string,
  blockers: WorkflowPackEnvironmentBridgeIssue[]
): void => {
  if (typeof value === 'string') {
    if (isAbsolutePathLike(value)) {
      addIssue(blockers, {
        code: 'absolute-path',
        field: currentPath,
        message: `Environment bridge input must not contain a local absolute path at ${JSON.stringify(currentPath)}.`
      });
    }

    if (isIsoDateTime(value)) {
      addIssue(blockers, {
        code: 'unstable-timestamp',
        field: currentPath,
        message: `Environment bridge input must not depend on unstable timestamp content at ${JSON.stringify(currentPath)}.`
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanInputBoundaries(entry, `${currentPath}[${index}]`, blockers));
    return;
  }

  const record = asRecord(value);
  if (!record) {
    return;
  }

  for (const [key, entry] of Object.entries(record)) {
    const nextPath = currentPath === '$' ? key : `${currentPath}.${key}`;

    if (FORBIDDEN_CLAIM_FIELDS.has(key)) {
      addIssue(blockers, {
        code: 'command-availability-claim',
        field: nextPath,
        message: `Environment bridge input must not claim command or workflow availability via ${JSON.stringify(nextPath)}.`
      });
    }

    if (FORBIDDEN_UNSTABLE_FIELD_NAMES.has(key)) {
      addIssue(blockers, {
        code: 'unstable-timestamp',
        field: nextPath,
        message: `Environment bridge input must not include unstable field ${JSON.stringify(nextPath)}.`
      });
    }

    scanInputBoundaries(entry, nextPath, blockers);
  }
};

type CollectStringArrayOptions = {
  field: string;
  preserveOrder?: boolean;
  requirePrefix?: string;
  invalidValueCode?: WorkflowPackEnvironmentBridgeIssueCode;
  invalidValueMessage?: (fieldPath: string) => string;
};

const collectStableStringArray = (
  value: unknown,
  blockers: WorkflowPackEnvironmentBridgeIssue[],
  options: CollectStringArrayOptions
): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];
  value.forEach((entry, index) => {
    const fieldPath = `${options.field}[${index}]`;

    if (!isNonEmptyString(entry)) {
      addIssue(blockers, {
        code: options.invalidValueCode ?? 'invalid-value',
        field: fieldPath,
        message:
          options.invalidValueMessage?.(fieldPath) ??
          `${fieldPath} must be a non-empty string.`
      });
      return;
    }

    const normalized = normalizeRef(entry);
    if (isAbsolutePathLike(entry) || isIsoDateTime(entry)) {
      return;
    }

    if (options.requirePrefix && !normalized.startsWith(options.requirePrefix)) {
      addIssue(blockers, {
        code: 'raw-secret-value',
        field: fieldPath,
        message: `${fieldPath} must use a provider-neutral secret ref instead of a raw secret value.`
      });
      return;
    }

    result.push(normalized);
  });

  return options.preserveOrder ? uniquePreservingOrder(result) : sortUnique(result);
};

const normalizeVerificationGate = (
  value: unknown,
  blockers: WorkflowPackEnvironmentBridgeIssue[]
): WorkflowPackEnvironmentBridgeReport['verificationGate'] => {
  const gate = asRecord(value);
  return {
    mode: gate && isKnownVerificationMode(gate.mode) ? gate.mode : 'unknown',
    requiredEvidenceRefs: collectStableStringArray(gate?.requiredEvidenceRefs, blockers, {
      field: 'verificationGate.requiredEvidenceRefs'
    }),
    failurePolicy: gate && isKnownVerificationFailurePolicy(gate.failurePolicy) ? gate.failurePolicy : 'unknown'
  };
};

const normalizeApprovalPolicy = (
  value: unknown,
  blockers: WorkflowPackEnvironmentBridgeIssue[]
): WorkflowPackEnvironmentBridgeReport['approvalPolicy'] => {
  const approvalPolicy = asRecord(value);
  return {
    mode: approvalPolicy && isKnownApprovalPolicyMode(approvalPolicy.mode) ? approvalPolicy.mode : 'unknown',
    requiredApprovals: isFinitePositiveInteger(approvalPolicy?.requiredApprovals)
      ? approvalPolicy.requiredApprovals
      : 0,
    approverRoles: collectStableStringArray(approvalPolicy?.approverRoles, blockers, {
      field: 'approvalPolicy.approverRoles'
    })
  };
};

export const buildWorkflowPackEnvironmentBridgeReport = (
  input: WorkflowPackEnvironmentBridgeInput
): WorkflowPackEnvironmentBridgeReport => {
  const warnings: WorkflowPackEnvironmentBridgeIssue[] = [];
  const blockers: WorkflowPackEnvironmentBridgeIssue[] = [];

  scanInputBoundaries(input, '$', blockers);

  const workflowPackId = isNonEmptyString(input.workflowPackId) &&
    !isAbsolutePathLike(input.workflowPackId) &&
    !isIsoDateTime(input.workflowPackId)
    ? normalizeText(input.workflowPackId)
    : DEFAULT_WORKFLOW_PACK_ID;

  const environmentName = isNonEmptyString(input.environmentName) &&
    !isAbsolutePathLike(input.environmentName) &&
    !isIsoDateTime(input.environmentName)
    ? normalizeText(input.environmentName)
    : DEFAULT_ENVIRONMENT_NAME;

  if (!isNonEmptyString(input.workflowPackId)) {
    addIssue(blockers, {
      code: 'missing-field',
      field: 'workflowPackId',
      message: 'Environment bridge input must include workflowPackId.'
    });
  }

  if (!isNonEmptyString(input.environmentName)) {
    addIssue(blockers, {
      code: 'missing-field',
      field: 'environmentName',
      message: 'Environment bridge input must include environmentName.'
    });
  }

  const verificationGate = normalizeVerificationGate(input.verificationGate, blockers);
  const approvalPolicy = normalizeApprovalPolicy(input.approvalPolicy, blockers);
  const requiredSecrets = collectStableStringArray(input.requiredSecrets, blockers, {
    field: 'requiredSecrets',
    requirePrefix: 'ref://'
  });
  const receiptRefs = collectStableStringArray(input.receiptRefs, blockers, {
    field: 'receiptRefs'
  });
  const consumerRules = collectStableStringArray(input.consumerRules, blockers, {
    field: 'consumerRules',
    preserveOrder: true
  });

  const publishMode: WorkflowPackEnvironmentBridgeReportPublishMode = isKnownPublishMode(input.publishMode)
    ? input.publishMode
    : 'unknown';
  const deploymentMode: WorkflowPackEnvironmentBridgeReportDeploymentMode = isKnownDeploymentMode(input.deploymentMode)
    ? input.deploymentMode
    : 'unknown';

  if (!asRecord(input.verificationGate)) {
    addIssue(blockers, {
      code: 'missing-field',
      field: 'verificationGate',
      message: 'Environment bridge input must include verificationGate.'
    });
  }

  if (verificationGate.mode === 'unknown') {
    addIssue(blockers, {
      code: 'invalid-value',
      field: 'verificationGate.mode',
      message: 'verificationGate.mode must be a supported environment gate mode.'
    });
  }

  if (verificationGate.requiredEvidenceRefs.length === 0) {
    addIssue(blockers, {
      code: 'missing-field',
      field: 'verificationGate.requiredEvidenceRefs',
      message: 'verificationGate.requiredEvidenceRefs must include one or more repo-relative receipt refs.'
    });
  }

  if (verificationGate.failurePolicy === 'unknown') {
    addIssue(blockers, {
      code: 'invalid-value',
      field: 'verificationGate.failurePolicy',
      message: 'verificationGate.failurePolicy must remain "block".'
    });
  }

  if (!asRecord(input.approvalPolicy)) {
    addIssue(blockers, {
      code: 'missing-field',
      field: 'approvalPolicy',
      message: 'Environment bridge input must include approvalPolicy.'
    });
  }

  if (approvalPolicy.mode === 'unknown') {
    addIssue(blockers, {
      code: 'invalid-value',
      field: 'approvalPolicy.mode',
      message: 'approvalPolicy.mode must be a supported approval policy mode.'
    });
  }

  if (approvalPolicy.requiredApprovals === 0) {
    addIssue(blockers, {
      code: 'invalid-value',
      field: 'approvalPolicy.requiredApprovals',
      message: 'approvalPolicy.requiredApprovals must be a positive integer.'
    });
  }

  if (approvalPolicy.approverRoles.length === 0) {
    addIssue(blockers, {
      code: 'missing-field',
      field: 'approvalPolicy.approverRoles',
      message: 'approvalPolicy.approverRoles must include one or more stable approver roles.'
    });
  }

  if (requiredSecrets.length === 0) {
    addIssue(blockers, {
      code: 'missing-field',
      field: 'requiredSecrets',
      message: 'requiredSecrets must include one or more provider-neutral secret refs.'
    });
  }

  if (input.secretRefsOnly !== true) {
    addIssue(blockers, {
      code: 'secret-refs-only-violation',
      field: 'secretRefsOnly',
      message: 'secretRefsOnly must remain true for workflow-pack environment bridges.'
    });
  }

  if (publishMode === 'unknown') {
    addIssue(blockers, {
      code: 'invalid-value',
      field: 'publishMode',
      message: 'publishMode must be a supported workflow-pack publish posture.'
    });
  }

  if (deploymentMode === 'unknown') {
    addIssue(blockers, {
      code: 'invalid-value',
      field: 'deploymentMode',
      message: 'deploymentMode must be a supported workflow-pack deployment posture.'
    });
  }

  if (receiptRefs.length === 0) {
    addIssue(blockers, {
      code: 'missing-field',
      field: 'receiptRefs',
      message: 'receiptRefs must include one or more repo-relative receipt refs.'
    });
  }

  if (consumerRules.length === 0) {
    addIssue(blockers, {
      code: 'missing-field',
      field: 'consumerRules',
      message: 'consumerRules must include one or more explicit downstream inheritance rules.'
    });
  }

  const missingReceiptRefs = verificationGate.requiredEvidenceRefs.filter((ref) => !receiptRefs.includes(ref));
  for (const ref of missingReceiptRefs) {
    addIssue(blockers, {
      code: 'verification-receipt-gap',
      field: 'receiptRefs',
      message: `receiptRefs must preserve verification evidence ref ${JSON.stringify(ref)}.`
    });
  }

  const hasConsumerHandoffGap =
    deploymentMode === 'external_consumer_handoff' &&
    receiptRefs.length > 0 &&
    missingReceiptRefs.length === 0 &&
    receiptRefs.length === verificationGate.requiredEvidenceRefs.length;

  if (hasConsumerHandoffGap) {
    addIssue(warnings, {
      code: 'consumer-handoff-receipt-gap',
      field: 'receiptRefs',
      message:
        'external_consumer_handoff should preserve at least one downstream handoff receipt ref beyond the verification gate receipts.'
    });
  }

  const dedupedWarnings = dedupeIssues(warnings);
  const dedupedBlockers = dedupeIssues(blockers);

  const secretRefSafety: WorkflowPackEnvironmentBridgeSecretRefSafety =
    dedupedBlockers.some((issue) => issue.code === 'raw-secret-value')
      ? 'raw_secret_detected'
      : dedupedBlockers.some(
            (issue) =>
              issue.code === 'secret-refs-only-violation' ||
              (issue.code === 'missing-field' && issue.field === 'requiredSecrets')
          )
        ? 'mixed_or_invalid'
        : 'refs_only';

  const receiptRefStatus: WorkflowPackEnvironmentBridgeReceiptRefStatus =
    receiptRefs.length === 0
      ? 'missing'
      : missingReceiptRefs.length > 0
        ? 'verification_gap'
        : hasConsumerHandoffGap
          ? 'consumer_handoff_gap'
          : 'complete';

  const verificationGateStatus: WorkflowPackEnvironmentBridgeVerificationGateStatus =
    verificationGate.mode === 'unknown' ||
    verificationGate.failurePolicy === 'unknown' ||
    verificationGate.requiredEvidenceRefs.length === 0
      ? 'missing'
      : missingReceiptRefs.length > 0
        ? 'receipt_gap'
        : 'declared';

  const approvalPolicyStatus: WorkflowPackEnvironmentBridgeApprovalPolicyStatus =
    approvalPolicy.mode === 'unknown' ||
    approvalPolicy.requiredApprovals === 0 ||
    approvalPolicy.approverRoles.length === 0
      ? 'missing'
      : 'declared';

  const status: WorkflowPackEnvironmentBridgeReportStatus =
    dedupedBlockers.length > 0 ? 'blocked' : dedupedWarnings.length > 0 ? 'warning' : 'ok';

  return {
    schemaVersion: WORKFLOW_PACK_ENVIRONMENT_BRIDGE_REPORT_SCHEMA_VERSION,
    workflowPackId,
    environmentName,
    summary: {
      status,
      overview: `${environmentName} bridges ${workflowPackId} through ${verificationGate.mode} verification, ${approvalPolicy.mode} approval, ${publishMode} publish, and ${deploymentMode} deployment.`,
      verificationGateStatus,
      approvalPolicyStatus,
      publishPosture: publishMode,
      deploymentPosture: deploymentMode,
      secretRefSafety,
      receiptRefStatus,
      consumerRuleStatus: consumerRules.length > 0 ? 'present' : 'missing',
      warningCount: dedupedWarnings.length,
      blockerCount: dedupedBlockers.length
    },
    verificationGate,
    approvalPolicy,
    publishMode,
    deploymentMode,
    requiredSecrets,
    receiptRefs,
    consumerRules,
    warnings: dedupedWarnings,
    blockers: dedupedBlockers
  };
};
