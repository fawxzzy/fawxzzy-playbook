import {
  WORKFLOW_PACK_ENVIRONMENT_BRIDGE_REPORT_SCHEMA_VERSION,
  type WorkflowPackEnvironmentBridgeIssue,
  type WorkflowPackEnvironmentBridgeIssueCode,
  type WorkflowPackEnvironmentBridgeReport,
  type WorkflowPackEnvironmentBridgeReportApprovalPolicyMode,
  type WorkflowPackEnvironmentBridgeReportDeploymentMode,
  type WorkflowPackEnvironmentBridgeReportPublishMode,
  type WorkflowPackEnvironmentBridgeReportStatus
} from './environmentBridge.js';

export const WORKFLOW_PACK_ENVIRONMENT_BRIDGE_PLAN_SCHEMA_VERSION =
  'playbook.workflow-pack.environment-bridge.plan.v1' as const;

export type WorkflowPackEnvironmentBridgePlanStatus = 'ready' | 'blocked' | 'needs_review';
export type WorkflowPackEnvironmentBridgePlanPhase =
  | 'verification_gate'
  | 'approval_policy'
  | 'secret_refs'
  | 'receipt_refs'
  | 'publish_mode'
  | 'deployment_mode'
  | 'consumer_rules';
export type WorkflowPackEnvironmentBridgePlanActionType = 'document' | 'configure' | 'verify' | 'review';
export type WorkflowPackEnvironmentBridgePlanIssueCode =
  | WorkflowPackEnvironmentBridgeIssueCode
  | 'generated-runtime-path';

export type WorkflowPackEnvironmentBridgePlanIssue = {
  code: WorkflowPackEnvironmentBridgePlanIssueCode;
  message: string;
  field?: string;
};

export type WorkflowPackEnvironmentBridgePlanInput = WorkflowPackEnvironmentBridgeReport & Record<string, unknown>;

export type WorkflowPackEnvironmentBridgePlanSourceReport = {
  schemaVersion: typeof WORKFLOW_PACK_ENVIRONMENT_BRIDGE_REPORT_SCHEMA_VERSION;
  status: WorkflowPackEnvironmentBridgeReportStatus;
  verificationGateStatus: WorkflowPackEnvironmentBridgeReport['summary']['verificationGateStatus'];
  approvalPolicyStatus: WorkflowPackEnvironmentBridgeReport['summary']['approvalPolicyStatus'];
  publishMode: WorkflowPackEnvironmentBridgeReportPublishMode;
  deploymentMode: WorkflowPackEnvironmentBridgeReportDeploymentMode;
  warningCount: number;
  blockerCount: number;
};

export type WorkflowPackEnvironmentBridgePlanStep = {
  id: string;
  phase: WorkflowPackEnvironmentBridgePlanPhase;
  title: string;
  description: string;
  actionType: WorkflowPackEnvironmentBridgePlanActionType;
  dependsOn: string[];
  evidenceRefs: string[];
  blockedBy: string[];
};

export type WorkflowPackEnvironmentBridgePlanApprovalRequirement = {
  mode: WorkflowPackEnvironmentBridgeReportApprovalPolicyMode;
  minimumApprovals: number;
  approverRoles: string[];
};

export type WorkflowPackEnvironmentBridgePlanConsumerRuleAction = {
  rule: string;
  stepId: string;
  action: string;
};

export type WorkflowPackEnvironmentBridgePlanBoundaries = {
  mutationSurface: 'read_only_planner';
  forbids: string[];
};

export type WorkflowPackEnvironmentBridgePlan = {
  schemaVersion: typeof WORKFLOW_PACK_ENVIRONMENT_BRIDGE_PLAN_SCHEMA_VERSION;
  workflowPackId: string;
  environmentName: string;
  status: WorkflowPackEnvironmentBridgePlanStatus;
  summary: {
    overview: string;
    sourceReportStatus: WorkflowPackEnvironmentBridgeReportStatus;
    stepCount: number;
    warningCount: number;
    blockerCount: number;
  };
  sourceReport: WorkflowPackEnvironmentBridgePlanSourceReport;
  implementationSteps: WorkflowPackEnvironmentBridgePlanStep[];
  requiredApprovals: WorkflowPackEnvironmentBridgePlanApprovalRequirement;
  requiredSecretRefs: string[];
  requiredReceiptRefs: string[];
  consumerRuleActions: WorkflowPackEnvironmentBridgePlanConsumerRuleAction[];
  warnings: WorkflowPackEnvironmentBridgePlanIssue[];
  blockers: WorkflowPackEnvironmentBridgePlanIssue[];
  boundaries: WorkflowPackEnvironmentBridgePlanBoundaries;
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
  'workspaceRoot',
  'runtimePath',
  'runtimeRoot',
  'generatedRuntimePath'
]);

const FORBIDDEN_BOUNDARIES: string[] = [
  'no_cli_command',
  'no_docs_commands',
  'no_workflow_writes',
  'no_github_actions_mutation',
  'no_lifeline_execution_changes',
  'no_runtime_writes',
  'no_repo_scanning',
  'no_secret_materialization'
];

const DEFAULT_WORKFLOW_PACK_ID = 'invalid-workflow-pack';
const DEFAULT_ENVIRONMENT_NAME = 'invalid-environment';

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isAbsolutePathLike = (value: string): boolean =>
  /^[A-Za-z]:[\\/]/.test(value) ||
  /^\\\\/.test(value) ||
  /^\/(?:Users|home|var|tmp)\//.test(value);

const isIsoDateTime = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value);

const isGeneratedRuntimePathLike = (value: string): boolean =>
  /(^|[\\/])runtime([\\/]|$)/i.test(value) || /^\.playbook\/runtime\//i.test(value);

const normalizeText = (value: string): string => value.trim();
const normalizeRef = (value: string): string => normalizeText(value).replace(/\\/g, '/');

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const compareIssues = (
  left: WorkflowPackEnvironmentBridgePlanIssue,
  right: WorkflowPackEnvironmentBridgePlanIssue
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

const dedupeIssues = (issues: WorkflowPackEnvironmentBridgePlanIssue[]): WorkflowPackEnvironmentBridgePlanIssue[] => {
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

const toPlanIssue = (
  issue: WorkflowPackEnvironmentBridgeIssue | WorkflowPackEnvironmentBridgePlanIssue
): WorkflowPackEnvironmentBridgePlanIssue => ({
  code: issue.code,
  message: issue.message,
  ...(issue.field ? { field: issue.field } : {})
});

const addIssue = (
  issues: WorkflowPackEnvironmentBridgePlanIssue[],
  issue: WorkflowPackEnvironmentBridgePlanIssue
): void => {
  issues.push(issue);
};

const scanPlannerInputBoundaries = (
  value: unknown,
  currentPath: string,
  blockers: WorkflowPackEnvironmentBridgePlanIssue[]
): void => {
  if (typeof value === 'string') {
    if (isAbsolutePathLike(value)) {
      addIssue(blockers, {
        code: 'absolute-path',
        field: currentPath,
        message: `Environment bridge planner input must not contain a local absolute path at ${JSON.stringify(currentPath)}.`
      });
    }

    if (isIsoDateTime(value)) {
      addIssue(blockers, {
        code: 'unstable-timestamp',
        field: currentPath,
        message: `Environment bridge planner input must not depend on unstable timestamp content at ${JSON.stringify(currentPath)}.`
      });
    }

    if (isGeneratedRuntimePathLike(value)) {
      addIssue(blockers, {
        code: 'generated-runtime-path',
        field: currentPath,
        message: `Environment bridge planner input must not contain a generated runtime path at ${JSON.stringify(currentPath)}.`
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanPlannerInputBoundaries(entry, `${currentPath}[${index}]`, blockers));
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
        message: `Environment bridge planner input must not claim command or workflow availability via ${JSON.stringify(nextPath)}.`
      });
    }

    if (FORBIDDEN_UNSTABLE_FIELD_NAMES.has(key)) {
      addIssue(blockers, {
        code: key.toLowerCase().includes('runtime') ? 'generated-runtime-path' : 'unstable-timestamp',
        field: nextPath,
        message: key.toLowerCase().includes('runtime')
          ? `Environment bridge planner input must not include generated runtime field ${JSON.stringify(nextPath)}.`
          : `Environment bridge planner input must not include unstable field ${JSON.stringify(nextPath)}.`
      });
    }

    scanPlannerInputBoundaries(entry, nextPath, blockers);
  }
};

const issueRef = (issue: WorkflowPackEnvironmentBridgePlanIssue): string =>
  issue.field ? `${issue.code}:${issue.field}` : issue.code;

const blockRefsFor = (
  blockers: WorkflowPackEnvironmentBridgePlanIssue[],
  options: {
    fieldPrefixes: string[];
    codes?: WorkflowPackEnvironmentBridgePlanIssueCode[];
    includeGlobal?: boolean;
  }
): string[] =>
  blockers
    .filter((issue) => {
      const field = issue.field ?? '';
      const matchesField = options.fieldPrefixes.some((prefix) => field === prefix || field.startsWith(`${prefix}.`) || field.startsWith(`${prefix}[`));
      const matchesCode = options.codes?.includes(issue.code) ?? false;
      const isGlobal = options.includeGlobal && !issue.field;
      return matchesField || matchesCode || isGlobal;
    })
    .map(issueRef)
    .sort((left, right) => left.localeCompare(right));

const normalizeStableRefList = (values: string[]): string[] =>
  sortUnique(
    values
      .filter((value) => isNonEmptyString(value) && !isAbsolutePathLike(value) && !isIsoDateTime(value) && !isGeneratedRuntimePathLike(value))
      .map(normalizeRef)
  );

const buildSourceReport = (report: WorkflowPackEnvironmentBridgeReport): WorkflowPackEnvironmentBridgePlanSourceReport => ({
  schemaVersion: report.schemaVersion,
  status: report.summary.status,
  verificationGateStatus: report.summary.verificationGateStatus,
  approvalPolicyStatus: report.summary.approvalPolicyStatus,
  publishMode: report.publishMode,
  deploymentMode: report.deploymentMode,
  warningCount: report.summary.warningCount,
  blockerCount: report.summary.blockerCount
});

const buildVerificationStep = (
  report: WorkflowPackEnvironmentBridgeReport,
  blockers: WorkflowPackEnvironmentBridgePlanIssue[]
): WorkflowPackEnvironmentBridgePlanStep => ({
  id: 'verification-gate',
  phase: 'verification_gate',
  title: 'Validate verification gate evidence requirements',
  description: `Confirm ${report.environmentName} preserves ${report.verificationGate.mode} verification and retains the required evidence refs before any publish or deployment work advances.`,
  actionType: 'verify',
  dependsOn: [],
  evidenceRefs: normalizeStableRefList(report.verificationGate.requiredEvidenceRefs),
  blockedBy: blockRefsFor(blockers, {
    fieldPrefixes: ['verificationGate', 'sourceReport'],
    codes: ['missing-field', 'verification-receipt-gap', 'unstable-timestamp', 'absolute-path', 'generated-runtime-path'],
    includeGlobal: true
  })
});

const buildApprovalStep = (
  report: WorkflowPackEnvironmentBridgeReport,
  blockers: WorkflowPackEnvironmentBridgePlanIssue[]
): WorkflowPackEnvironmentBridgePlanStep => ({
  id: 'approval-policy',
  phase: 'approval_policy',
  title: 'Carry approval policy into consumer review boundaries',
  description: `Document ${report.approvalPolicy.mode} approval expectations for ${report.environmentName} with ${report.approvalPolicy.requiredApprovals} required approval slot(s) and stable approver roles.`,
  actionType: 'review',
  dependsOn: ['verification-gate'],
  evidenceRefs: [],
  blockedBy: blockRefsFor(blockers, {
    fieldPrefixes: ['approvalPolicy'],
    codes: ['missing-field', 'invalid-value', 'unstable-timestamp', 'generated-runtime-path'],
    includeGlobal: true
  })
});

const buildSecretRefsStep = (
  report: WorkflowPackEnvironmentBridgeReport,
  blockers: WorkflowPackEnvironmentBridgePlanIssue[]
): WorkflowPackEnvironmentBridgePlanStep => ({
  id: 'secret-refs',
  phase: 'secret_refs',
  title: 'Map provider-neutral secret refs without materializing values',
  description: `Carry only provider-neutral secret refs into downstream configuration for ${report.workflowPackId}; raw secret values remain blocked.`,
  actionType: 'configure',
  dependsOn: ['verification-gate'],
  evidenceRefs: normalizeStableRefList(report.requiredSecrets),
  blockedBy: blockRefsFor(blockers, {
    fieldPrefixes: ['requiredSecrets', 'secretRefsOnly'],
    codes: ['raw-secret-value', 'secret-refs-only-violation', 'missing-field', 'generated-runtime-path'],
    includeGlobal: true
  })
});

const buildReceiptRefsStep = (
  report: WorkflowPackEnvironmentBridgeReport,
  requiredReceiptRefs: string[],
  blockers: WorkflowPackEnvironmentBridgePlanIssue[]
): WorkflowPackEnvironmentBridgePlanStep => ({
  id: 'receipt-refs',
  phase: 'receipt_refs',
  title: 'Preserve receipt refs for verification and downstream handoff',
  description:
    report.summary.receiptRefStatus === 'complete'
      ? 'Keep the declared receipt refs available as downstream evidence and preserve them as the canonical receipt boundary.'
      : 'Add or reconcile the missing receipt refs so verification evidence and downstream handoff evidence remain explicit and reviewable.',
  actionType: 'verify',
  dependsOn: ['verification-gate'],
  evidenceRefs: requiredReceiptRefs,
  blockedBy: blockRefsFor(blockers, {
    fieldPrefixes: ['receiptRefs', 'verificationGate.requiredEvidenceRefs'],
    codes: ['verification-receipt-gap', 'consumer-handoff-receipt-gap', 'missing-field', 'absolute-path', 'generated-runtime-path'],
    includeGlobal: true
  })
});

const buildPublishModeStep = (
  report: WorkflowPackEnvironmentBridgeReport,
  requiredReceiptRefs: string[],
  blockers: WorkflowPackEnvironmentBridgePlanIssue[]
): WorkflowPackEnvironmentBridgePlanStep => ({
  id: 'publish-mode',
  phase: 'publish_mode',
  title: 'Document publish posture from the bridge report',
  description: `Keep ${report.publishMode} as a documented planning boundary so publish posture remains visible in the plan instead of being hidden in implementation details.`,
  actionType: 'document',
  dependsOn: ['verification-gate', 'approval-policy', 'secret-refs', 'receipt-refs'],
  evidenceRefs: requiredReceiptRefs,
  blockedBy: blockRefsFor(blockers, {
    fieldPrefixes: ['publishMode'],
    codes: ['invalid-value', 'generated-runtime-path'],
    includeGlobal: true
  })
});

const buildDeploymentModeStep = (
  report: WorkflowPackEnvironmentBridgeReport,
  requiredReceiptRefs: string[],
  blockers: WorkflowPackEnvironmentBridgePlanIssue[]
): WorkflowPackEnvironmentBridgePlanStep => ({
  id: 'deployment-mode',
  phase: 'deployment_mode',
  title: 'Document deployment posture from the bridge report',
  description: `Treat ${report.deploymentMode} as a planning posture only and keep deployment boundaries explicit without generating execution artifacts.`,
  actionType: 'document',
  dependsOn: ['publish-mode'],
  evidenceRefs: requiredReceiptRefs,
  blockedBy: blockRefsFor(blockers, {
    fieldPrefixes: ['deploymentMode', 'receiptRefs'],
    codes: ['consumer-handoff-receipt-gap', 'invalid-value', 'generated-runtime-path'],
    includeGlobal: true
  })
});

const buildConsumerRuleStep = (
  rule: string,
  index: number,
  requiredReceiptRefs: string[],
  blockers: WorkflowPackEnvironmentBridgePlanIssue[]
): WorkflowPackEnvironmentBridgePlanStep => ({
  id: `consumer-rule-${String(index + 1).padStart(2, '0')}`,
  phase: 'consumer_rules',
  title: `Review consumer rule ${index + 1}`,
  description: rule,
  actionType: 'review',
  dependsOn: ['deployment-mode'],
  evidenceRefs: requiredReceiptRefs,
  blockedBy: blockRefsFor(blockers, {
    fieldPrefixes: ['consumerRules'],
    codes: ['missing-field', 'generated-runtime-path'],
    includeGlobal: true
  })
});

export const buildWorkflowPackEnvironmentBridgePlan = (
  input: WorkflowPackEnvironmentBridgePlanInput
): WorkflowPackEnvironmentBridgePlan => {
  const propagatedWarnings = (Array.isArray(input.warnings) ? input.warnings : []).map(toPlanIssue);
  const propagatedBlockers = (Array.isArray(input.blockers) ? input.blockers : []).map(toPlanIssue);
  const plannerBlockers: WorkflowPackEnvironmentBridgePlanIssue[] = [];

  scanPlannerInputBoundaries(input, '$', plannerBlockers);

  const workflowPackId = isNonEmptyString(input.workflowPackId) &&
    !isAbsolutePathLike(input.workflowPackId) &&
    !isIsoDateTime(input.workflowPackId) &&
    !isGeneratedRuntimePathLike(input.workflowPackId)
    ? normalizeText(input.workflowPackId)
    : DEFAULT_WORKFLOW_PACK_ID;

  const environmentName = isNonEmptyString(input.environmentName) &&
    !isAbsolutePathLike(input.environmentName) &&
    !isIsoDateTime(input.environmentName) &&
    !isGeneratedRuntimePathLike(input.environmentName)
    ? normalizeText(input.environmentName)
    : DEFAULT_ENVIRONMENT_NAME;

  if (!isNonEmptyString(input.workflowPackId)) {
    addIssue(plannerBlockers, {
      code: 'missing-field',
      field: 'workflowPackId',
      message: 'Environment bridge planner input must include workflowPackId.'
    });
  }

  if (!isNonEmptyString(input.environmentName)) {
    addIssue(plannerBlockers, {
      code: 'missing-field',
      field: 'environmentName',
      message: 'Environment bridge planner input must include environmentName.'
    });
  }

  if (input.schemaVersion !== WORKFLOW_PACK_ENVIRONMENT_BRIDGE_REPORT_SCHEMA_VERSION) {
    addIssue(plannerBlockers, {
      code: 'invalid-value',
      field: 'schemaVersion',
      message: `schemaVersion must remain ${JSON.stringify(WORKFLOW_PACK_ENVIRONMENT_BRIDGE_REPORT_SCHEMA_VERSION)} for planner inputs.`
    });
  }

  const report = input as WorkflowPackEnvironmentBridgeReport;
  const requiredSecretRefs = normalizeStableRefList(report.requiredSecrets ?? []);
  const requiredReceiptRefs = normalizeStableRefList([
    ...(report.verificationGate?.requiredEvidenceRefs ?? []),
    ...(report.receiptRefs ?? [])
  ]);
  const consumerRules = uniquePreservingOrder(
    (Array.isArray(report.consumerRules) ? report.consumerRules : [])
      .filter(isNonEmptyString)
      .map(normalizeText)
      .filter((value) => !isAbsolutePathLike(value) && !isIsoDateTime(value) && !isGeneratedRuntimePathLike(value))
  );

  const blockers = dedupeIssues([...propagatedBlockers, ...plannerBlockers]);
  const warnings = dedupeIssues([...propagatedWarnings]);

  const implementationSteps = [
    buildVerificationStep(report, blockers),
    buildApprovalStep(report, blockers),
    buildSecretRefsStep(report, blockers),
    buildReceiptRefsStep(report, requiredReceiptRefs, blockers),
    buildPublishModeStep(report, requiredReceiptRefs, blockers),
    buildDeploymentModeStep(report, requiredReceiptRefs, blockers),
    ...consumerRules.map((rule, index) => buildConsumerRuleStep(rule, index, requiredReceiptRefs, blockers))
  ];

  const consumerRuleActions = consumerRules.map((rule, index) => ({
    rule,
    stepId: `consumer-rule-${String(index + 1).padStart(2, '0')}`,
    action: `Review and carry consumer rule ${index + 1} into downstream implementation guidance without generating execution artifacts.`
  }));

  const status: WorkflowPackEnvironmentBridgePlanStatus =
    blockers.length > 0
      ? 'blocked'
      : warnings.length > 0
        ? 'needs_review'
        : 'ready';

  const summaryOverview =
    status === 'blocked'
      ? `${environmentName} planning remains blocked for ${workflowPackId} until ${blockers.length} blocker(s) are resolved at the report-to-plan boundary.`
      : status === 'needs_review'
        ? `${environmentName} planning needs review for ${workflowPackId} because the bridge report still carries ${warnings.length} warning(s).`
        : `${environmentName} planning is ready for ${workflowPackId} with deterministic, commandless implementation steps and preserved governance boundaries.`;

  return {
    schemaVersion: WORKFLOW_PACK_ENVIRONMENT_BRIDGE_PLAN_SCHEMA_VERSION,
    workflowPackId,
    environmentName,
    status,
    summary: {
      overview: summaryOverview,
      sourceReportStatus: report.summary.status,
      stepCount: implementationSteps.length,
      warningCount: warnings.length,
      blockerCount: blockers.length
    },
    sourceReport: buildSourceReport(report),
    implementationSteps,
    requiredApprovals: {
      mode: report.approvalPolicy.mode,
      minimumApprovals: report.approvalPolicy.requiredApprovals,
      approverRoles: uniquePreservingOrder(report.approvalPolicy.approverRoles)
    },
    requiredSecretRefs,
    requiredReceiptRefs,
    consumerRuleActions,
    warnings,
    blockers,
    boundaries: {
      mutationSurface: 'read_only_planner',
      forbids: FORBIDDEN_BOUNDARIES
    }
  };
};
