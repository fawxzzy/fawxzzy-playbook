export const WORKFLOW_PACK_ENVIRONMENT_BRIDGE_EXECUTOR_SCHEMA_VERSION =
  'playbook.workflow-pack.environment-bridge.executor.v1' as const;
export const WORKFLOW_PACK_ENVIRONMENT_BRIDGE_EXECUTOR_RECEIPT_SCHEMA_VERSION =
  'playbook.workflow-pack.environment-bridge.executor-receipt.v1' as const;
export const WORKFLOW_PACK_ENVIRONMENT_BRIDGE_EXECUTOR_RECEIPT_KIND =
  'playbook.workflow-pack.environment-bridge.executor-receipt' as const;
export const WORKFLOW_PACK_ENVIRONMENT_BRIDGE_DRY_RUN_EXECUTOR_ID =
  'workflow-pack-environment-bridge.future-executor' as const;
export const WORKFLOW_PACK_ENVIRONMENT_BRIDGE_EXECUTOR_CONTRACT_REF =
  'exports/playbook.workflow-pack.environment-bridge.executor.example.v1.json' as const;

export type WorkflowPackEnvironmentBridgeExecutorMode =
  | 'dry_run'
  | 'plan_only'
  | 'apply_requested';

export type WorkflowPackEnvironmentBridgeExecutorMutationPolicyMode =
  | 'review_gated_apply'
  | 'dry_run_only'
  | 'plan_projection_only';

export type WorkflowPackEnvironmentBridgeExecutorReceiptStatus =
  | 'blocked'
  | 'dry_run_complete';

export type WorkflowPackEnvironmentBridgeExecutorReceiptIssueCode =
  | 'absolute-path'
  | 'command-availability-claim'
  | 'explicit-receipt-requirements'
  | 'invalid-value'
  | 'missing-approval'
  | 'raw-secret-value'
  | 'unstable-timestamp'
  | 'wildcard-mutation-target'
  | 'workflow-availability-claim';

export type WorkflowPackEnvironmentBridgeExecutorReceiptIssue = {
  code: WorkflowPackEnvironmentBridgeExecutorReceiptIssueCode;
  message: string;
  field?: string;
};

export type WorkflowPackEnvironmentBridgeExecutorContract = {
  schemaVersion?: string;
  workflowPackId?: string;
  environmentName?: string;
  sourcePlanRef?: string;
  executionMode?: WorkflowPackEnvironmentBridgeExecutorMode | string;
  mutationPolicy?: {
    mode?: WorkflowPackEnvironmentBridgeExecutorMutationPolicyMode | string;
    allowApply?: boolean;
    requireExplicitTargets?: boolean;
    requireReceiptEvidence?: boolean;
  } & Record<string, unknown>;
  approvalRequired?: boolean;
  allowedMutationTargets?: string[];
  forbiddenMutationTargets?: string[];
  requiredSecretRefs?: string[];
  requiredReceiptRefs?: string[];
  preflightChecks?: Array<{
    id?: string;
    title?: string;
    required?: boolean;
    evidenceRefs?: string[];
    blocksApply?: boolean;
  } & Record<string, unknown>>;
  executionSteps?: Array<{
    id?: string;
    title?: string;
    intent?: string;
    mutationTarget?: string;
    appliesInModes?: Array<WorkflowPackEnvironmentBridgeExecutorMode | string>;
    dependsOn?: string[];
    evidenceRefs?: string[];
  } & Record<string, unknown>>;
  rollbackPlan?: {
    strategy?: string;
    steps?: string[];
  } & Record<string, unknown>;
  receiptRequirements?: {
    requiredStatuses?: string[];
    requiredFields?: string[];
    requiredEvidenceRefs?: string[];
    requiredReceiptRefs?: string[];
  } & Record<string, unknown>;
  boundaries?: {
    mutationSurface?: string;
    forbids?: string[];
  } & Record<string, unknown>;
} & Record<string, unknown>;

export type WorkflowPackEnvironmentBridgeExecutorReceipt = {
  schemaVersion: typeof WORKFLOW_PACK_ENVIRONMENT_BRIDGE_EXECUTOR_RECEIPT_SCHEMA_VERSION;
  kind: typeof WORKFLOW_PACK_ENVIRONMENT_BRIDGE_EXECUTOR_RECEIPT_KIND;
  executorId: string;
  sourcePlanRef: string;
  executionMode: WorkflowPackEnvironmentBridgeExecutorMode;
  status: WorkflowPackEnvironmentBridgeExecutorReceiptStatus;
  completedSteps: string[];
  skippedSteps: string[];
  blockers: WorkflowPackEnvironmentBridgeExecutorReceiptIssue[];
  warnings: WorkflowPackEnvironmentBridgeExecutorReceiptIssue[];
  evidenceRefs: string[];
  mutationSummary: {
    attempted: false;
    appliedTargets: string[];
    skippedTargets: string[];
    appliedCount: 0;
  };
  receiptRefs: string[];
};

export type WorkflowPackEnvironmentBridgeDryRunExecutorOptions = {
  executorId?: string;
  executorRef?: string;
};

const COMMAND_CLAIM_FIELDS = new Set([
  'command',
  'commands',
  'commandAvailability',
  'commandStatus',
  'availability'
]);

const WORKFLOW_CLAIM_FIELDS = new Set([
  'workflow',
  'workflowAvailability',
  'workflowStatus',
  'workflowFile',
  'workflowPath',
  'workflowName',
  'generatedWorkflow',
  'generatedWorkflows'
]);

const UNSTABLE_TIME_FIELDS = new Set([
  'generatedAt',
  'createdAt',
  'updatedAt',
  'timestamp'
]);

const FORBIDDEN_PATH_FIELDS = new Set([
  'absolutePath',
  'localPath',
  'workspaceRoot',
  'runtimePath',
  'runtimeRoot'
]);

const REQUIRED_FORBIDDEN_TARGETS = [
  'raw_secret_values',
  'secret_materialization'
] as const;

const REQUIRED_RECEIPT_FIELDS = [
  'status',
  'completedSteps',
  'skippedSteps',
  'mutationSummary',
  'receiptRefs'
] as const;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const normalizeText = (value: string): string => value.trim();
const normalizeRef = (value: string): string => normalizeText(value).replace(/\\/g, '/');

const isAbsolutePathLike = (value: string): boolean =>
  /^[A-Za-z]:[\\/]/.test(value) ||
  /^\\\\/.test(value) ||
  /^\/(?:Users|home|var|tmp)\//.test(value);

const isIsoDateTime = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value);

const isProviderNeutralSecretRef = (value: string): boolean => value.startsWith('ref://');

const isRepoRelativeRef = (value: string): boolean =>
  !isAbsolutePathLike(value) && !isIsoDateTime(value) && value.length > 0;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

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

const sortUnique = (values: string[]): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const compareIssues = (
  left: WorkflowPackEnvironmentBridgeExecutorReceiptIssue,
  right: WorkflowPackEnvironmentBridgeExecutorReceiptIssue
): number =>
  left.code.localeCompare(right.code) ||
  (left.field ?? '').localeCompare(right.field ?? '') ||
  left.message.localeCompare(right.message);

const dedupeIssues = (
  issues: WorkflowPackEnvironmentBridgeExecutorReceiptIssue[]
): WorkflowPackEnvironmentBridgeExecutorReceiptIssue[] => {
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
  issues: WorkflowPackEnvironmentBridgeExecutorReceiptIssue[],
  issue: WorkflowPackEnvironmentBridgeExecutorReceiptIssue
): void => {
  issues.push(issue);
};

const isKnownExecutionMode = (
  value: unknown
): value is WorkflowPackEnvironmentBridgeExecutorMode =>
  value === 'dry_run' || value === 'plan_only' || value === 'apply_requested';

const isKnownMutationPolicyMode = (
  value: unknown
): value is WorkflowPackEnvironmentBridgeExecutorMutationPolicyMode =>
  value === 'review_gated_apply' ||
  value === 'dry_run_only' ||
  value === 'plan_projection_only';

const looksWildcardLike = (value: string): boolean =>
  /[*]/.test(value) ||
  /(?:^|[._-])(all|any|implicit|automatic)(?:$|[._-])/i.test(value);

const collectStringArray = (
  value: unknown,
  field: string,
  blockers: WorkflowPackEnvironmentBridgeExecutorReceiptIssue[],
  warnings: WorkflowPackEnvironmentBridgeExecutorReceiptIssue[],
  options: {
    preserveOrder?: boolean;
    repoRelative?: boolean;
    providerNeutralSecret?: boolean;
    wildcardSafe?: boolean;
    missingWarningMessage?: string;
  } = {}
): string[] => {
  if (!Array.isArray(value)) {
    if (options.missingWarningMessage) {
      addIssue(warnings, {
        code: options.providerNeutralSecret ? 'raw-secret-value' : 'invalid-value',
        field,
        message: options.missingWarningMessage
      });
    }
    return [];
  }

  const collected: string[] = [];
  value.forEach((entry, index) => {
    const fieldPath = `${field}[${index}]`;
    if (!isNonEmptyString(entry)) {
      addIssue(blockers, {
        code: 'invalid-value',
        field: fieldPath,
        message: `${fieldPath} must be a non-empty string.`
      });
      return;
    }

    const normalized = normalizeRef(entry);

    if (isAbsolutePathLike(entry)) {
      addIssue(blockers, {
        code: 'absolute-path',
        field: fieldPath,
        message: `${fieldPath} must not contain a local absolute path.`
      });
      return;
    }

    if (isIsoDateTime(entry)) {
      addIssue(blockers, {
        code: 'unstable-timestamp',
        field: fieldPath,
        message: `${fieldPath} must not depend on unstable timestamp content.`
      });
      return;
    }

    if (options.providerNeutralSecret && !isProviderNeutralSecretRef(normalized)) {
      addIssue(blockers, {
        code: 'raw-secret-value',
        field: fieldPath,
        message: `${fieldPath} must use a provider-neutral secret ref instead of a raw secret value.`
      });
      return;
    }

    if (options.repoRelative && !isRepoRelativeRef(normalized)) {
      addIssue(blockers, {
        code: 'absolute-path',
        field: fieldPath,
        message: `${fieldPath} must use a repo-relative ref.`
      });
      return;
    }

    if (options.wildcardSafe && looksWildcardLike(normalized)) {
      addIssue(blockers, {
        code: 'wildcard-mutation-target',
        field: fieldPath,
        message: `${fieldPath} must remain explicit and finite.`
      });
      return;
    }

    collected.push(normalized);
  });

  return options.preserveOrder ? uniquePreservingOrder(collected) : sortUnique(collected);
};

const scanContractBoundaries = (
  value: unknown,
  currentPath: string,
  blockers: WorkflowPackEnvironmentBridgeExecutorReceiptIssue[]
): void => {
  if (typeof value === 'string') {
    if (isAbsolutePathLike(value)) {
      addIssue(blockers, {
        code: 'absolute-path',
        field: currentPath,
        message: `Dry-run executor input must not contain a local absolute path at ${JSON.stringify(currentPath)}.`
      });
    }

    if (isIsoDateTime(value)) {
      addIssue(blockers, {
        code: 'unstable-timestamp',
        field: currentPath,
        message: `Dry-run executor input must not depend on unstable timestamp content at ${JSON.stringify(currentPath)}.`
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      scanContractBoundaries(entry, `${currentPath}[${index}]`, blockers)
    );
    return;
  }

  const record = asRecord(value);
  if (!record) {
    return;
  }

  for (const [key, entry] of Object.entries(record)) {
    const nextPath = currentPath === '$' ? key : `${currentPath}.${key}`;

    if (COMMAND_CLAIM_FIELDS.has(key)) {
      addIssue(blockers, {
        code: 'command-availability-claim',
        field: nextPath,
        message: `Dry-run executor input must not claim command availability via ${JSON.stringify(nextPath)}.`
      });
    }

    if (WORKFLOW_CLAIM_FIELDS.has(key)) {
      addIssue(blockers, {
        code: 'workflow-availability-claim',
        field: nextPath,
        message: `Dry-run executor input must not claim workflow availability via ${JSON.stringify(nextPath)}.`
      });
    }

    if (UNSTABLE_TIME_FIELDS.has(key)) {
      addIssue(blockers, {
        code: 'unstable-timestamp',
        field: nextPath,
        message: `Dry-run executor input must not include unstable field ${JSON.stringify(nextPath)}.`
      });
    }

    if (FORBIDDEN_PATH_FIELDS.has(key)) {
      addIssue(blockers, {
        code: 'absolute-path',
        field: nextPath,
        message: `Dry-run executor input must not include local path field ${JSON.stringify(nextPath)}.`
      });
    }

    scanContractBoundaries(entry, nextPath, blockers);
  }
};

const normalizeEvidenceRef = (
  value: string,
  field: string,
  blockers: WorkflowPackEnvironmentBridgeExecutorReceiptIssue[]
): string | null => {
  const normalized = normalizeRef(value);
  if (isAbsolutePathLike(value)) {
    addIssue(blockers, {
      code: 'absolute-path',
      field,
      message: `${field} must not contain a local absolute path.`
    });
    return null;
  }

  if (isIsoDateTime(value)) {
    addIssue(blockers, {
      code: 'unstable-timestamp',
      field,
      message: `${field} must not depend on unstable timestamp content.`
    });
    return null;
  }

  if (!isProviderNeutralSecretRef(normalized) && !isRepoRelativeRef(normalized)) {
    addIssue(blockers, {
      code: 'invalid-value',
      field,
      message: `${field} must be a repo-relative ref or a provider-neutral secret ref.`
    });
    return null;
  }

  return normalized;
};

const normalizeEvidenceRefList = (
  values: unknown,
  field: string,
  blockers: WorkflowPackEnvironmentBridgeExecutorReceiptIssue[]
): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }

  const collected: string[] = [];
  values.forEach((entry, index) => {
    if (!isNonEmptyString(entry)) {
      addIssue(blockers, {
        code: 'invalid-value',
        field: `${field}[${index}]`,
        message: `${field}[${index}] must be a non-empty string.`
      });
      return;
    }

    const normalized = normalizeEvidenceRef(entry, `${field}[${index}]`, blockers);
    if (normalized) {
      collected.push(normalized);
    }
  });

  return uniquePreservingOrder(collected);
};

const normalizeStepIds = (
  values: unknown,
  field: string,
  blockers: WorkflowPackEnvironmentBridgeExecutorReceiptIssue[]
): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }

  const ids: string[] = [];
  values.forEach((entry, index) => {
    const record = asRecord(entry);
    const fieldPath = `${field}[${index}]`;
    if (!record) {
      addIssue(blockers, {
        code: 'invalid-value',
        field: fieldPath,
        message: `${fieldPath} must be an object.`
      });
      return;
    }

    if (!isNonEmptyString(record.id)) {
      addIssue(blockers, {
        code: 'invalid-value',
        field: `${fieldPath}.id`,
        message: `${fieldPath}.id must be a non-empty string.`
      });
      return;
    }

    ids.push(normalizeText(record.id));
  });

  return uniquePreservingOrder(ids);
};

const applicableExecutionStepIds = (
  steps: unknown,
  executionMode: WorkflowPackEnvironmentBridgeExecutorMode,
  blockers: WorkflowPackEnvironmentBridgeExecutorReceiptIssue[]
): { applicable: string[]; skipped: string[] } => {
  if (!Array.isArray(steps)) {
    return { applicable: [], skipped: [] };
  }

  const applicable: string[] = [];
  const skipped: string[] = [];

  steps.forEach((entry, index) => {
    const record = asRecord(entry);
    const fieldPath = `executionSteps[${index}]`;
    if (!record || !isNonEmptyString(record.id)) {
      return;
    }

    const stepId = normalizeText(record.id);
    const appliesInModes = Array.isArray(record.appliesInModes)
      ? record.appliesInModes.filter(isNonEmptyString).map(normalizeText)
      : [];

    if (appliesInModes.length === 0) {
      addIssue(blockers, {
        code: 'invalid-value',
        field: `${fieldPath}.appliesInModes`,
        message: `${fieldPath}.appliesInModes must include one or more execution modes.`
      });
      skipped.push(stepId);
      return;
    }

    if (appliesInModes.includes(executionMode)) {
      applicable.push(stepId);
    } else {
      skipped.push(stepId);
    }
  });

  return { applicable, skipped };
};

export const buildWorkflowPackEnvironmentBridgeDryRunReceipt = (
  input: WorkflowPackEnvironmentBridgeExecutorContract,
  options: WorkflowPackEnvironmentBridgeDryRunExecutorOptions = {}
): WorkflowPackEnvironmentBridgeExecutorReceipt => {
  const blockers: WorkflowPackEnvironmentBridgeExecutorReceiptIssue[] = [];
  const warnings: WorkflowPackEnvironmentBridgeExecutorReceiptIssue[] = [];

  scanContractBoundaries(input, '$', blockers);

  const executionMode = isKnownExecutionMode(input.executionMode)
    ? input.executionMode
    : 'dry_run';

  if (input.schemaVersion !== WORKFLOW_PACK_ENVIRONMENT_BRIDGE_EXECUTOR_SCHEMA_VERSION) {
    addIssue(blockers, {
      code: 'invalid-value',
      field: 'schemaVersion',
      message: `schemaVersion must remain ${JSON.stringify(WORKFLOW_PACK_ENVIRONMENT_BRIDGE_EXECUTOR_SCHEMA_VERSION)}.`
    });
  }

  if (!isNonEmptyString(input.workflowPackId)) {
    addIssue(blockers, {
      code: 'invalid-value',
      field: 'workflowPackId',
      message: 'workflowPackId must be a non-empty string.'
    });
  }

  if (!isNonEmptyString(input.environmentName)) {
    addIssue(blockers, {
      code: 'invalid-value',
      field: 'environmentName',
      message: 'environmentName must be a non-empty string.'
    });
  }

  const sourcePlanRef =
    isNonEmptyString(input.sourcePlanRef) && isRepoRelativeRef(normalizeRef(input.sourcePlanRef))
      ? normalizeRef(input.sourcePlanRef)
      : '';

  if (!isNonEmptyString(input.sourcePlanRef)) {
    addIssue(blockers, {
      code: 'invalid-value',
      field: 'sourcePlanRef',
      message: 'sourcePlanRef must be a non-empty repo-relative ref.'
    });
  } else if (isAbsolutePathLike(input.sourcePlanRef)) {
    addIssue(blockers, {
      code: 'absolute-path',
      field: 'sourcePlanRef',
      message: 'sourcePlanRef must not contain a local absolute path.'
    });
  } else if (isIsoDateTime(input.sourcePlanRef)) {
    addIssue(blockers, {
      code: 'unstable-timestamp',
      field: 'sourcePlanRef',
      message: 'sourcePlanRef must not depend on unstable timestamp content.'
    });
  }

  if (!isKnownExecutionMode(input.executionMode)) {
    addIssue(blockers, {
      code: 'invalid-value',
      field: 'executionMode',
      message: 'executionMode must be one of dry_run, plan_only, or apply_requested.'
    });
  }

  const mutationPolicy = asRecord(input.mutationPolicy);
  if (!mutationPolicy) {
    addIssue(blockers, {
      code: 'invalid-value',
      field: 'mutationPolicy',
      message: 'mutationPolicy must be an object.'
    });
  } else {
    if (!isKnownMutationPolicyMode(mutationPolicy.mode)) {
      addIssue(blockers, {
        code: 'invalid-value',
        field: 'mutationPolicy.mode',
        message: 'mutationPolicy.mode must be a supported executor mutation policy mode.'
      });
    }

    if (mutationPolicy.requireExplicitTargets !== true) {
      addIssue(blockers, {
        code: 'invalid-value',
        field: 'mutationPolicy.requireExplicitTargets',
        message: 'mutationPolicy.requireExplicitTargets must remain true.'
      });
    }

    if (mutationPolicy.requireReceiptEvidence !== true) {
      addIssue(blockers, {
        code: 'explicit-receipt-requirements',
        field: 'mutationPolicy.requireReceiptEvidence',
        message: 'mutationPolicy.requireReceiptEvidence must remain true.'
      });
    }
  }

  if (executionMode === 'apply_requested' && input.approvalRequired !== true) {
    addIssue(blockers, {
      code: 'missing-approval',
      field: 'approvalRequired',
      message: 'apply_requested dry-run execution requires approvalRequired=true before an apply path can be previewed.'
    });
  }

  const allowedMutationTargets = collectStringArray(
    input.allowedMutationTargets,
    'allowedMutationTargets',
    blockers,
    warnings,
    {
      preserveOrder: false,
      wildcardSafe: true
    }
  );

  if (allowedMutationTargets.length === 0) {
    addIssue(blockers, {
      code: 'wildcard-mutation-target',
      field: 'allowedMutationTargets',
      message: 'allowedMutationTargets must declare one or more explicit, finite mutation targets.'
    });
  }

  const forbiddenMutationTargets = collectStringArray(
    input.forbiddenMutationTargets,
    'forbiddenMutationTargets',
    blockers,
    warnings,
    {
      preserveOrder: false
    }
  );

  for (const target of REQUIRED_FORBIDDEN_TARGETS) {
    if (!forbiddenMutationTargets.includes(target)) {
      addIssue(blockers, {
        code: 'invalid-value',
        field: 'forbiddenMutationTargets',
        message: `forbiddenMutationTargets must include ${JSON.stringify(target)}.`
      });
    }
  }

  collectStringArray(
    input.requiredSecretRefs,
    'requiredSecretRefs',
    blockers,
    warnings,
    {
      preserveOrder: false,
      providerNeutralSecret: true,
      missingWarningMessage:
        'requiredSecretRefs should remain explicit so dry-run receipts can prove secret-ref coverage.'
    }
  );

  const requiredReceiptRefs = collectStringArray(
    input.requiredReceiptRefs,
    'requiredReceiptRefs',
    blockers,
    warnings,
    {
      preserveOrder: false,
      repoRelative: true
    }
  );

  if (requiredReceiptRefs.length === 0) {
    addIssue(blockers, {
      code: 'explicit-receipt-requirements',
      field: 'requiredReceiptRefs',
      message: 'requiredReceiptRefs must remain explicit so dry-run receipts can preserve receipt ownership.'
    });
  }

  const preflightChecks = Array.isArray(input.preflightChecks)
    ? input.preflightChecks
    : [];
  const executionSteps = Array.isArray(input.executionSteps)
    ? input.executionSteps
    : [];

  const preflightStepIds = normalizeStepIds(preflightChecks, 'preflightChecks', blockers);
  const { applicable: applicableExecutionIds, skipped: ineligibleExecutionIds } =
    applicableExecutionStepIds(executionSteps, executionMode, blockers);

  preflightChecks.forEach((entry, index) => {
    const record = asRecord(entry);
    if (!record) {
      return;
    }

    normalizeEvidenceRefList(
      record.evidenceRefs,
      `preflightChecks[${index}].evidenceRefs`,
      blockers
    );
  });

  executionSteps.forEach((entry, index) => {
    const record = asRecord(entry);
    if (!record) {
      return;
    }

    if (!isNonEmptyString(record.mutationTarget)) {
      addIssue(blockers, {
        code: 'invalid-value',
        field: `executionSteps[${index}].mutationTarget`,
        message: `executionSteps[${index}].mutationTarget must be a non-empty string.`
      });
    } else {
      const mutationTarget = normalizeText(record.mutationTarget);
      if (looksWildcardLike(mutationTarget)) {
        addIssue(blockers, {
          code: 'wildcard-mutation-target',
          field: `executionSteps[${index}].mutationTarget`,
          message: `executionSteps[${index}].mutationTarget must remain explicit and finite.`
        });
      }

      if (forbiddenMutationTargets.includes(mutationTarget)) {
        addIssue(blockers, {
          code: 'invalid-value',
          field: `executionSteps[${index}].mutationTarget`,
          message: `executionSteps[${index}].mutationTarget must not target a forbidden mutation surface.`
        });
      }

      if (!allowedMutationTargets.includes(mutationTarget)) {
        addIssue(blockers, {
          code: 'invalid-value',
          field: `executionSteps[${index}].mutationTarget`,
          message: `executionSteps[${index}].mutationTarget must be declared in allowedMutationTargets.`
        });
      }
    }

    normalizeEvidenceRefList(
      record.evidenceRefs,
      `executionSteps[${index}].evidenceRefs`,
      blockers
    );
  });

  allowedMutationTargets.forEach((target, index) => {
    if (forbiddenMutationTargets.includes(target)) {
      addIssue(blockers, {
        code: 'invalid-value',
        field: `allowedMutationTargets[${index}]`,
        message: `allowedMutationTargets[${index}] must not overlap with forbiddenMutationTargets.`
      });
    }
  });

  const receiptRequirements = asRecord(input.receiptRequirements);
  if (!receiptRequirements) {
    addIssue(blockers, {
      code: 'explicit-receipt-requirements',
      field: 'receiptRequirements',
      message: 'receiptRequirements must remain explicit.'
    });
  } else {
    const requiredStatuses = collectStringArray(
      receiptRequirements.requiredStatuses,
      'receiptRequirements.requiredStatuses',
      blockers,
      warnings,
      { preserveOrder: true }
    );
    const requiredFields = collectStringArray(
      receiptRequirements.requiredFields,
      'receiptRequirements.requiredFields',
      blockers,
      warnings,
      { preserveOrder: true }
    );
    const requiredEvidenceRefs = collectStringArray(
      receiptRequirements.requiredEvidenceRefs,
      'receiptRequirements.requiredEvidenceRefs',
      blockers,
      warnings,
      { preserveOrder: true, repoRelative: true }
    );
    const explicitReceiptRefs = collectStringArray(
      receiptRequirements.requiredReceiptRefs,
      'receiptRequirements.requiredReceiptRefs',
      blockers,
      warnings,
      { preserveOrder: true, repoRelative: true }
    );

    if (
      requiredStatuses.length === 0 ||
      !requiredStatuses.includes('blocked') ||
      !requiredStatuses.includes('dry_run_complete')
    ) {
      addIssue(blockers, {
        code: 'explicit-receipt-requirements',
        field: 'receiptRequirements.requiredStatuses',
        message:
          'receiptRequirements.requiredStatuses must explicitly include blocked and dry_run_complete.'
      });
    }

    if (
      requiredFields.length === 0 ||
      !REQUIRED_RECEIPT_FIELDS.every((field) => requiredFields.includes(field))
    ) {
      addIssue(blockers, {
        code: 'explicit-receipt-requirements',
        field: 'receiptRequirements.requiredFields',
        message:
          'receiptRequirements.requiredFields must explicitly preserve status, completedSteps, skippedSteps, mutationSummary, and receiptRefs.'
      });
    }

    if (requiredEvidenceRefs.length === 0) {
      addIssue(blockers, {
        code: 'explicit-receipt-requirements',
        field: 'receiptRequirements.requiredEvidenceRefs',
        message: 'receiptRequirements.requiredEvidenceRefs must remain explicit.'
      });
    }

    if (explicitReceiptRefs.length === 0) {
      addIssue(blockers, {
        code: 'explicit-receipt-requirements',
        field: 'receiptRequirements.requiredReceiptRefs',
        message: 'receiptRequirements.requiredReceiptRefs must remain explicit.'
      });
    }
  }

  const dedupedBlockers = dedupeIssues(blockers);
  const dedupedWarnings = dedupeIssues(warnings);

  const completedSteps =
    dedupedBlockers.length === 0
      ? [...preflightStepIds, ...applicableExecutionIds]
      : [];

  const skippedSteps =
    dedupedBlockers.length === 0
      ? ineligibleExecutionIds
      : [...preflightStepIds, ...applicableExecutionIds, ...ineligibleExecutionIds];

  const executorRef =
    isNonEmptyString(options.executorRef) &&
    isRepoRelativeRef(normalizeRef(options.executorRef))
      ? normalizeRef(options.executorRef)
      : WORKFLOW_PACK_ENVIRONMENT_BRIDGE_EXECUTOR_CONTRACT_REF;

  const receiptRefs = uniquePreservingOrder([
    executorRef,
    ...[sourcePlanRef].filter(isNonEmptyString),
    ...requiredReceiptRefs
  ]);

  return {
    schemaVersion: WORKFLOW_PACK_ENVIRONMENT_BRIDGE_EXECUTOR_RECEIPT_SCHEMA_VERSION,
    kind: WORKFLOW_PACK_ENVIRONMENT_BRIDGE_EXECUTOR_RECEIPT_KIND,
    executorId: isNonEmptyString(options.executorId)
      ? normalizeText(options.executorId)
      : WORKFLOW_PACK_ENVIRONMENT_BRIDGE_DRY_RUN_EXECUTOR_ID,
    sourcePlanRef,
    executionMode,
    status: dedupedBlockers.length > 0 ? 'blocked' : 'dry_run_complete',
    completedSteps,
    skippedSteps,
    blockers: dedupedBlockers,
    warnings: dedupedWarnings,
    evidenceRefs: receiptRefs,
    mutationSummary: {
      attempted: false,
      appliedTargets: [],
      skippedTargets: allowedMutationTargets,
      appliedCount: 0
    },
    receiptRefs
  };
};
