import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCAL_VERIFICATION_RECEIPT_LOG_RELATIVE_PATH, LOCAL_VERIFICATION_RECEIPT_RELATIVE_PATH } from '@zachariahredfield/playbook-core';
import { defaultConfig, type PlaybookConfig } from '../config/schema.js';
import { resolveLocalVerificationCommand, runLocalVerification } from './localVerification.js';

const createConfig = (command: string | null = null): PlaybookConfig => ({
  ...defaultConfig,
  verify: {
    ...defaultConfig.verify,
    local: {
      ...defaultConfig.verify.local,
      command,
    },
  },
});

describe('local verification workflow', () => {
  it('resolves repo-defined verify:local scripts through the detected package manager', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-local-verify-resolution-'));
    fs.writeFileSync(
      path.join(repoRoot, 'package.json'),
      JSON.stringify({
        packageManager: 'pnpm@10.0.0',
        scripts: {
          'verify:local': 'echo ok',
        },
      }, null, 2),
      'utf8',
    );

    const resolved = resolveLocalVerificationCommand(repoRoot, createConfig());

    expect(resolved).toEqual({
      source: 'package.json#scripts.verify:local',
      package_manager: 'pnpm',
      command: 'pnpm run verify:local',
    });
  });

  it('writes a durable local-only verification receipt and evidence logs without a remote provider', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-local-verify-receipt-'));
    const command = `node -e "process.stdout.write('local-ok\\n')"`;

    const result = runLocalVerification(repoRoot, createConfig(command), { mode: 'local-only' });

    expect(result.receipt.workflow.verification.state).toBe('passed');
    expect(result.receipt.workflow.publishing.state).toBe('not-configured');
    expect(result.receipt.workflow.deployment.state).toBe('not-observed');
    expect(result.receipt.local_verification.stdout_path).toContain('.stdout.log');
    expect(result.receipt.local_verification.stdout_path).not.toContain(':');
    expect(result.receipt.local_verification.stderr_path).not.toContain(':');
    expect(result.receipt.provider.kind).toBe('none');
    expect(fs.existsSync(path.join(repoRoot, LOCAL_VERIFICATION_RECEIPT_RELATIVE_PATH))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, LOCAL_VERIFICATION_RECEIPT_LOG_RELATIVE_PATH))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, result.receipt.local_verification.stdout_path ?? ''))).toBe(true);
    expect(fs.readFileSync(path.join(repoRoot, result.receipt.local_verification.stdout_path ?? ''), 'utf8')).toContain('local-ok');
  });
});
