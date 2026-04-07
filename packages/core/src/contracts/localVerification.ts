export const LOCAL_VERIFICATION_RECEIPT_SCHEMA_VERSION = '1.0' as const;
export const LOCAL_VERIFICATION_RECEIPT_KIND = 'local-verification-receipt' as const;
export const LOCAL_VERIFICATION_RECEIPT_LOG_KIND = 'local-verification-receipt-log' as const;

export const LOCAL_VERIFICATION_RECEIPT_RELATIVE_PATH = '.playbook/local-verification-receipt.json' as const;
export const LOCAL_VERIFICATION_RECEIPT_LOG_RELATIVE_PATH = '.playbook/local-verification-receipts.json' as const;
export const LOCAL_VERIFICATION_OUTPUTS_RELATIVE_DIR = '.playbook/local-verification' as const;

export const workflowProviderKinds = ['none', 'github', 'gitlab', 'bitbucket', 'generic-git'] as const;
export type WorkflowProviderKind = (typeof workflowProviderKinds)[number];

export const workflowStatusAuthorities = ['local-receipt', 'provider-status', 'handoff-record', 'not-applicable'] as const;
export type WorkflowStatusAuthority = (typeof workflowStatusAuthorities)[number];

export const workflowVerificationStates = ['passed', 'failed', 'not-run'] as const;
export type WorkflowVerificationState = (typeof workflowVerificationStates)[number];

export const workflowPublishingStates = ['not-configured', 'not-observed', 'synced', 'failed'] as const;
export type WorkflowPublishingState = (typeof workflowPublishingStates)[number];

export const workflowDeploymentStates = ['not-configured', 'not-observed', 'promoted', 'failed'] as const;
export type WorkflowDeploymentState = (typeof workflowDeploymentStates)[number];

export const localVerificationModes = ['governance-only', 'combined', 'local-only'] as const;
export type LocalVerificationMode = (typeof localVerificationModes)[number];

export const localVerificationExecutionStatuses = ['passed', 'failed', 'not-configured'] as const;
export type LocalVerificationExecutionStatus = (typeof localVerificationExecutionStatuses)[number];

export const localVerificationPackageManagers = ['pnpm', 'npm', 'yarn', 'bun', 'unknown'] as const;
export type LocalVerificationPackageManager = (typeof localVerificationPackageManagers)[number];

export type WorkflowProviderContext = {
  kind: WorkflowProviderKind;
  remote_name: string | null;
  remote_url: string | null;
  remote_configured: boolean;
  optional: true;
  status_authority: WorkflowStatusAuthority;
};

export type WorkflowVerificationContract = {
  state: WorkflowVerificationState;
  status_authority: 'local-receipt';
  receipt_path: string | null;
  summary: string;
};

export type WorkflowPublishingContract = {
  state: WorkflowPublishingState;
  status_authority: 'provider-status' | 'not-applicable';
  summary: string;
};

export type WorkflowDeploymentContract = {
  state: WorkflowDeploymentState;
  status_authority: 'handoff-record' | 'not-applicable';
  summary: string;
};

export type LocalVerificationCommandContract = {
  source: string;
  package_manager: LocalVerificationPackageManager;
  command: string;
};

export type LocalVerificationReceipt = {
  schemaVersion: typeof LOCAL_VERIFICATION_RECEIPT_SCHEMA_VERSION;
  kind: typeof LOCAL_VERIFICATION_RECEIPT_KIND;
  receipt_id: string;
  generated_at: string;
  repo_root: string;
  verification_mode: LocalVerificationMode;
  provider: WorkflowProviderContext;
  workflow: {
    verification: WorkflowVerificationContract;
    publishing: WorkflowPublishingContract;
    deployment: WorkflowDeploymentContract;
  };
  local_verification: {
    configured: boolean;
    status: LocalVerificationExecutionStatus;
    command: LocalVerificationCommandContract | null;
    exit_code: number | null;
    duration_ms: number | null;
    stdout_path: string | null;
    stderr_path: string | null;
    started_at: string | null;
    completed_at: string | null;
  };
  governance: {
    evaluated: boolean;
    ok: boolean | null;
    failures: number;
    warnings: number;
    base_ref: string | null;
    base_sha: string | null;
  };
  summary: string;
};

export type LocalVerificationReceiptLog = {
  schemaVersion: typeof LOCAL_VERIFICATION_RECEIPT_SCHEMA_VERSION;
  kind: typeof LOCAL_VERIFICATION_RECEIPT_LOG_KIND;
  receipts: LocalVerificationReceipt[];
};
