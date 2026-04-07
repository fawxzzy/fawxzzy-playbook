import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  LOCAL_VERIFICATION_OUTPUTS_RELATIVE_DIR,
  LOCAL_VERIFICATION_RECEIPT_KIND,
  LOCAL_VERIFICATION_RECEIPT_LOG_KIND,
  LOCAL_VERIFICATION_RECEIPT_LOG_RELATIVE_PATH,
  LOCAL_VERIFICATION_RECEIPT_RELATIVE_PATH,
  LOCAL_VERIFICATION_RECEIPT_SCHEMA_VERSION,
  collectScmContext,
  type LocalVerificationCommandContract,
  type LocalVerificationMode,
  type LocalVerificationPackageManager,
  type LocalVerificationReceipt,
  type LocalVerificationReceiptLog,
  type WorkflowProviderContext,
} from '@zachariahredfield/playbook-core';
import { writeJsonArtifact, readJsonArtifact } from '../artifacts/artifactIO.js';
import type { PlaybookConfig } from '../config/schema.js';
import type { VerifyReport } from '../report/types.js';

type PackageJson = {
  packageManager?: string;
  scripts?: Record<string, string>;
};

export type LocalVerificationExecutionResult = {
  receipt: LocalVerificationReceipt;
  receiptPath: typeof LOCAL_VERIFICATION_RECEIPT_RELATIVE_PATH;
  receiptLogPath: typeof LOCAL_VERIFICATION_RECEIPT_LOG_RELATIVE_PATH;
};

const readPackageJson = (repoRoot: string): PackageJson => {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageJson;
};

const detectPackageManager = (repoRoot: string): LocalVerificationPackageManager => {
  const packageJson = readPackageJson(repoRoot);
  const packageManagerField = packageJson.packageManager?.split('@')[0];
  if (packageManagerField === 'pnpm' || packageManagerField === 'npm' || packageManagerField === 'yarn' || packageManagerField === 'bun') {
    return packageManagerField;
  }

  if (fs.existsSync(path.join(repoRoot, 'pnpm-lock.yaml')) || fs.existsSync(path.join(repoRoot, 'pnpm-workspace.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(repoRoot, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(repoRoot, 'bun.lockb')) || fs.existsSync(path.join(repoRoot, 'bun.lock'))) {
    return 'bun';
  }
  if (fs.existsSync(path.join(repoRoot, 'package-lock.json'))) {
    return 'npm';
  }

  return 'npm';
};

const buildScriptCommand = (packageManager: LocalVerificationPackageManager, scriptName: string): string => {
  switch (packageManager) {
    case 'pnpm':
      return `pnpm run ${scriptName}`;
    case 'yarn':
      return `yarn run ${scriptName}`;
    case 'bun':
      return `bun run ${scriptName}`;
    case 'npm':
    case 'unknown':
    default:
      return `npm run ${scriptName}`;
  }
};

export const resolveLocalVerificationCommand = (
  repoRoot: string,
  config: PlaybookConfig,
): LocalVerificationCommandContract | null => {
  if (!config.verify.local.enabled) {
    return null;
  }

  if (typeof config.verify.local.command === 'string' && config.verify.local.command.trim().length > 0) {
    return {
      source: 'playbook.config.json',
      package_manager: 'unknown',
      command: config.verify.local.command.trim(),
    };
  }

  const packageJson = readPackageJson(repoRoot);
  const scripts = packageJson.scripts ?? {};
  const packageManager = detectPackageManager(repoRoot);

  const primaryScriptName = config.verify.local.scriptName.trim();
  if (primaryScriptName.length > 0 && typeof scripts[primaryScriptName] === 'string') {
    return {
      source: `package.json#scripts.${primaryScriptName}`,
      package_manager: packageManager,
      command: buildScriptCommand(packageManager, primaryScriptName),
    };
  }

  const fallbackScriptName = config.verify.local.fallbackScriptName?.trim();
  if (fallbackScriptName && typeof scripts[fallbackScriptName] === 'string') {
    return {
      source: `package.json#scripts.${fallbackScriptName}`,
      package_manager: packageManager,
      command: buildScriptCommand(packageManager, fallbackScriptName),
    };
  }

  return null;
};

const toProviderContext = (repoRoot: string): WorkflowProviderContext => {
  const scmContext = collectScmContext(repoRoot);
  return {
    kind: scmContext.provider.kind,
    remote_name: scmContext.provider.remoteName,
    remote_url: scmContext.provider.remoteUrl,
    remote_configured: scmContext.provider.remoteConfigured,
    optional: true,
    status_authority: scmContext.provider.statusAuthority,
  };
};

const buildPublishingContract = (provider: WorkflowProviderContext): LocalVerificationReceipt['workflow']['publishing'] => {
  if (!provider.remote_configured) {
    return {
      state: 'not-configured',
      status_authority: 'not-applicable',
      summary: 'No remote provider is configured. Publishing is optional and does not define local verification truth.',
    };
  }

  return {
    state: 'not-observed',
    status_authority: 'provider-status',
    summary: `Remote provider "${provider.kind}" is configured, but remote publishing status is optional and not authoritative for local verification truth.`,
  };
};

const buildDeploymentContract = (): LocalVerificationReceipt['workflow']['deployment'] => ({
  state: 'not-observed',
  status_authority: 'handoff-record',
  summary: 'Deployment remains a separate promotion or handoff concern and is not inferred from local verification or publishing state.',
});

const readReceiptLog = (repoRoot: string): LocalVerificationReceiptLog => {
  const absolutePath = path.join(repoRoot, LOCAL_VERIFICATION_RECEIPT_LOG_RELATIVE_PATH);
  if (!fs.existsSync(absolutePath)) {
    return {
      schemaVersion: LOCAL_VERIFICATION_RECEIPT_SCHEMA_VERSION,
      kind: LOCAL_VERIFICATION_RECEIPT_LOG_KIND,
      receipts: [],
    };
  }

  try {
    return readJsonArtifact<LocalVerificationReceiptLog>(absolutePath);
  } catch {
    return {
      schemaVersion: LOCAL_VERIFICATION_RECEIPT_SCHEMA_VERSION,
      kind: LOCAL_VERIFICATION_RECEIPT_LOG_KIND,
      receipts: [],
    };
  }
};

const sortReceipts = (receipts: LocalVerificationReceipt[]): LocalVerificationReceipt[] =>
  [...receipts].sort((left, right) =>
    right.generated_at.localeCompare(left.generated_at) ||
    left.receipt_id.localeCompare(right.receipt_id));

const writeCommandOutput = (repoRoot: string, relativePath: string, value: string): void => {
  const absolutePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, value, 'utf8');
};

const createReceiptId = (input: {
  repoRoot: string;
  mode: LocalVerificationMode;
  generatedAt: string;
  command: string | null;
  exitCode: number | null;
}): string =>
  `local-verification:${createHash('sha256')
    .update(JSON.stringify(input), 'utf8')
    .digest('hex')
    .slice(0, 16)}`;

const sanitizeArtifactPathSegment = (value: string): string =>
  value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim() || 'artifact';

export const runLocalVerification = (
  repoRoot: string,
  config: PlaybookConfig,
  options: {
    mode: Extract<LocalVerificationMode, 'combined' | 'local-only'>;
    governanceReport?: VerifyReport;
  },
): LocalVerificationExecutionResult => {
  const command = resolveLocalVerificationCommand(repoRoot, config);
  if (!command) {
    throw new Error(
      'playbook verify: local verification requested but no repo-defined local verification command was found. Add package.json#scripts.verify:local or configure verify.local.command in playbook.config.json.',
    );
  }

  const provider = toProviderContext(repoRoot);
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const completed = spawnSync(command.command, { cwd: repoRoot, shell: true, encoding: 'utf8' });
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startTime;
  const exitCode = completed.status ?? (completed.error ? 1 : 0);
  const verificationState = exitCode === 0 ? 'passed' : 'failed';
  const generatedAt = completedAt;
  const receiptId = createReceiptId({
    repoRoot,
    mode: options.mode,
    generatedAt,
    command: command.command,
    exitCode,
  });
  const outputBase = path.posix.join(
    LOCAL_VERIFICATION_OUTPUTS_RELATIVE_DIR,
    sanitizeArtifactPathSegment(receiptId),
  );
  const stdoutPath = `${outputBase}.stdout.log`;
  const stderrPath = `${outputBase}.stderr.log`;

  writeCommandOutput(repoRoot, stdoutPath, completed.stdout ?? '');
  writeCommandOutput(repoRoot, stderrPath, `${completed.stderr ?? ''}${completed.error ? `${completed.error.message}\n` : ''}`);

  const receipt: LocalVerificationReceipt = {
    schemaVersion: LOCAL_VERIFICATION_RECEIPT_SCHEMA_VERSION,
    kind: LOCAL_VERIFICATION_RECEIPT_KIND,
    receipt_id: receiptId,
    generated_at: generatedAt,
    repo_root: repoRoot,
    verification_mode: options.mode,
    provider,
    workflow: {
      verification: {
        state: verificationState,
        status_authority: 'local-receipt',
        receipt_path: LOCAL_VERIFICATION_RECEIPT_RELATIVE_PATH,
        summary: verificationState === 'passed'
          ? 'Local verification receipt is the source of truth for this verification gate.'
          : 'Local verification receipt recorded a failing gate result; remote status did not override it.',
      },
      publishing: buildPublishingContract(provider),
      deployment: buildDeploymentContract(),
    },
    local_verification: {
      configured: true,
      status: verificationState,
      command,
      exit_code: exitCode,
      duration_ms: durationMs,
      stdout_path: stdoutPath,
      stderr_path: stderrPath,
      started_at: startedAt,
      completed_at: completedAt,
    },
    governance: {
      evaluated: options.mode === 'combined',
      ok: options.mode === 'combined' ? options.governanceReport?.ok ?? null : null,
      failures: options.mode === 'combined' ? options.governanceReport?.failures.length ?? 0 : 0,
      warnings: options.mode === 'combined' ? options.governanceReport?.warnings.length ?? 0 : 0,
      base_ref: options.mode === 'combined' ? options.governanceReport?.summary.baseRef ?? null : null,
      base_sha: options.mode === 'combined' ? options.governanceReport?.summary.baseSha ?? null : null,
    },
    summary: options.mode === 'combined'
      ? `Governance verification ${options.governanceReport?.ok ? 'passed' : 'failed'}; local verification ${verificationState}.`
      : `Local verification ${verificationState}; publishing and deployment remain separate optional workflow concerns.`,
  };

  writeJsonArtifact(path.join(repoRoot, LOCAL_VERIFICATION_RECEIPT_RELATIVE_PATH), receipt as unknown as Record<string, unknown>);

  const existingLog = readReceiptLog(repoRoot);
  const nextLog: LocalVerificationReceiptLog = {
    schemaVersion: LOCAL_VERIFICATION_RECEIPT_SCHEMA_VERSION,
    kind: LOCAL_VERIFICATION_RECEIPT_LOG_KIND,
    receipts: sortReceipts([
      ...existingLog.receipts.filter((entry) => entry.receipt_id !== receipt.receipt_id),
      receipt,
    ]),
  };
  writeJsonArtifact(path.join(repoRoot, LOCAL_VERIFICATION_RECEIPT_LOG_RELATIVE_PATH), nextLog as unknown as Record<string, unknown>);

  return {
    receipt,
    receiptPath: LOCAL_VERIFICATION_RECEIPT_RELATIVE_PATH,
    receiptLogPath: LOCAL_VERIFICATION_RECEIPT_LOG_RELATIVE_PATH,
  };
};
