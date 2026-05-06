import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import type { VerifyRule } from '../lib/loadVerifyRules.js';

const verifyRepo = vi.fn();
const loadConfig = vi.fn();
const formatHuman = vi.fn();
const loadVerifyRules = vi.fn<() => Promise<VerifyRule[]>>();
const getLatestMutableRun = vi.fn();
const createExecutionIntent = vi.fn();
const createExecutionRun = vi.fn();
const appendExecutionStep = vi.fn();
const executionRunPath = vi.fn();
const attachSessionRunState = vi.fn();
const completeExecutionRun = vi.fn();
const appendCommandExecutionQualityRecord = vi.fn();
const recordCommandExecution = vi.fn();
const safeRecordRepositoryEvent = vi.fn((callback: () => void) => callback());
const recordCommandQuality = vi.fn();
const resolveLocalVerificationCommand = vi.fn();
const runLocalVerification = vi.fn();
const VERIFY_PHASE_RULES = { preflight: ['release.version-governance'] } as const;

vi.mock('@zachariahredfield/playbook-engine', () => ({ verifyRepo, loadConfig, formatHuman, getLatestMutableRun, createExecutionIntent, createExecutionRun, appendExecutionStep, completeExecutionRun, executionRunPath, attachSessionRunState, appendCommandExecutionQualityRecord, safeRecordRepositoryEvent, recordCommandExecution, recordCommandQuality, resolveLocalVerificationCommand, runLocalVerification, VERIFY_PHASE_RULES }));
vi.mock('../lib/loadVerifyRules.js', () => ({ loadVerifyRules }));

describe('runVerify policy mode', () => {
  beforeEach(() => {
    verifyRepo.mockReset();
    loadConfig.mockReset();
    formatHuman.mockReset();
    loadVerifyRules.mockReset();
    getLatestMutableRun.mockReset();
    createExecutionIntent.mockReset();
    createExecutionRun.mockReset();
    appendExecutionStep.mockReset();
    executionRunPath.mockReset();
    attachSessionRunState.mockReset();
    completeExecutionRun.mockReset();
    resolveLocalVerificationCommand.mockReset();
    runLocalVerification.mockReset();
    formatHuman.mockReturnValue('human report');
    loadConfig.mockReturnValue({ config: { verify: { policy: { rules: [] } } } });
    getLatestMutableRun.mockReturnValue({ id: 'run-test', steps: [] });
    appendExecutionStep.mockReturnValue({ id: 'run-test', steps: [] });
    resolveLocalVerificationCommand.mockReturnValue(null);
    loadVerifyRules.mockResolvedValue([
      {
        id: 'requireNotesOnChanges',
        description: 'require notes updates',
        check: ({ failure }) => failure.id === 'requireNotesOnChanges',
        policy: { id: 'requireNotesOnChanges' },
        remediation: ['update notes']
      },
      {
        id: 'notes.empty',
        description: 'notes should not be empty',
        check: ({ failure }) => failure.id === 'notes.empty',
        policy: { id: 'notes.empty' }
      }
    ]);
  });

  it('emits a local verification receipt in local-only mode', async () => {
    const { runVerify } = await import('./verify.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    loadConfig.mockReturnValue({
      config: {
        verify: {
          policy: { rules: [] },
          local: { enabled: true, scriptName: 'verify:local', fallbackScriptName: null, command: null }
        }
      }
    });
    runLocalVerification.mockReturnValue({
      receiptPath: '.playbook/local-verification-receipt.json',
      receiptLogPath: '.playbook/local-verification-receipts.json',
      receipt: {
        provider: { kind: 'none', remote_name: null, remote_url: null, remote_configured: false, optional: true, status_authority: 'not-applicable' },
        workflow: {
          verification: { state: 'passed', status_authority: 'local-receipt', receipt_path: '.playbook/local-verification-receipt.json', summary: 'local receipt truth' },
          publishing: { state: 'not-configured', status_authority: 'not-applicable', summary: 'publishing optional' },
          deployment: { state: 'not-observed', status_authority: 'handoff-record', summary: 'deployment separate' }
        },
        local_verification: {
          configured: true,
          status: 'passed',
          command: { source: 'package.json#scripts.verify:local', package_manager: 'pnpm', command: 'pnpm run verify:local' }
        },
        summary: 'Local verification passed.'
      }
    });

    const exitCode = await runVerify('/repo', { format: 'json', ci: true, quiet: true, explain: false, policy: false, localOnly: true });

    expect(exitCode).toBe(ExitCode.Success);
    expect(verifyRepo).not.toHaveBeenCalled();
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.verificationMode).toBe('local-only');
    expect(payload.workflow).toMatchObject({
      verification: { state: 'passed' },
      publishing: { state: 'not-configured' },
      deployment: { state: 'not-observed' }
    });
    expect(payload.localVerification).toMatchObject({
      status: 'passed',
      receiptPath: '.playbook/local-verification-receipt.json'
    });

    logSpy.mockRestore();
  });

  it('fails combined mode when the local verification gate fails', async () => {
    const { runVerify } = await import('./verify.js');

    verifyRepo.mockReturnValue({
      ok: true,
      summary: { failures: 0, warnings: 0 },
      failures: [],
      warnings: []
    });
    loadConfig.mockReturnValue({
      config: {
        verify: {
          policy: { rules: [] },
          local: { enabled: true, scriptName: 'verify:local', fallbackScriptName: null, command: null }
        }
      }
    });
    runLocalVerification.mockReturnValue({
      receiptPath: '.playbook/local-verification-receipt.json',
      receiptLogPath: '.playbook/local-verification-receipts.json',
      receipt: {
        provider: { kind: 'github', remote_name: 'origin', remote_url: 'https://github.com/example/repo', remote_configured: true, optional: true, status_authority: 'provider-status' },
        workflow: {
          verification: { state: 'failed', status_authority: 'local-receipt', receipt_path: '.playbook/local-verification-receipt.json', summary: 'local receipt truth' },
          publishing: { state: 'not-observed', status_authority: 'provider-status', summary: 'publishing optional' },
          deployment: { state: 'not-observed', status_authority: 'handoff-record', summary: 'deployment separate' }
        },
        local_verification: {
          configured: true,
          status: 'failed',
          command: { source: 'package.json#scripts.verify:local', package_manager: 'pnpm', command: 'pnpm run verify:local' }
        },
        summary: 'Local verification failed.'
      }
    });

    const exitCode = await runVerify('/repo', { format: 'json', ci: true, quiet: true, explain: false, policy: false, local: true });

    expect(exitCode).toBe(ExitCode.PolicyFailure);
  });



  it('prints help without invoking verify engine', async () => {
    const { runVerify } = await import('./verify.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runVerify('/repo', { format: 'text', ci: false, quiet: false, explain: false, policy: false, help: true });

    expect(exitCode).toBe(ExitCode.Success);
    expect(verifyRepo).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Usage: playbook verify [options]');

    logSpy.mockRestore();
  });

  it('returns policy failure when configured policy rule is violated', async () => {
    const { runVerify } = await import('./verify.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    verifyRepo.mockReturnValue({
      ok: false,
      summary: { failures: 1, warnings: 0 },
      failures: [{ id: 'requireNotesOnChanges', message: 'notes file not updated', fix: 'add notes' }],
      warnings: []
    });
    loadConfig.mockReturnValue({ config: { verify: { policy: { rules: ['requireNotesOnChanges'] } } } });

    const exitCode = await runVerify('/repo', { format: 'json', ci: true, quiet: true, explain: false, policy: true });

    expect(exitCode).toBe(ExitCode.PolicyFailure);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.ok).toBe(false);
    expect(payload.policyViolations).toEqual([
      {
        policyId: 'requireNotesOnChanges',
        ruleId: 'requireNotesOnChanges',
        message: 'notes file not updated',
        remediation: ['update notes']
      }
    ]);

    logSpy.mockRestore();
  });

  it('keeps non-policy failures informational in policy mode', async () => {
    const { runVerify } = await import('./verify.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    verifyRepo.mockReturnValue({
      ok: false,
      summary: { failures: 2, warnings: 0 },
      failures: [
        { id: 'requireNotesOnChanges', message: 'notes file not updated', fix: 'add notes' },
        { id: 'notes.empty', message: 'notes file is empty' }
      ],
      warnings: []
    });
    loadConfig.mockReturnValue({ config: { verify: { policy: { rules: ['requireNotesOnChanges'] } } } });

    const exitCode = await runVerify('/repo', { format: 'json', ci: true, quiet: true, explain: false, policy: true });

    expect(exitCode).toBe(ExitCode.PolicyFailure);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.findings).toEqual([
      expect.objectContaining({ id: 'verify.rule.requireNotesOnChanges', level: 'error' }),
      expect.objectContaining({ id: 'verify.rule.notes.empty', level: 'info' })
    ]);

    logSpy.mockRestore();
  });

  it('passes phase and rule selection through to the verify engine and result payload', async () => {
    const { runVerify } = await import('./verify.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    verifyRepo.mockReturnValue({
      ok: true,
      summary: { failures: 0, warnings: 0, phase: 'preflight', ruleIds: ['release.version-governance'] },
      failures: [],
      warnings: []
    });

    const exitCode = await runVerify('/repo', {
      format: 'json',
      ci: true,
      quiet: true,
      explain: false,
      policy: false,
      phase: 'preflight',
      ruleIds: ['release.version-governance']
    });

    expect(exitCode).toBe(ExitCode.Success);
    expect(verifyRepo).toHaveBeenCalledWith('/repo', { phase: 'preflight', ruleIds: ['release.version-governance'] });
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.phase).toBe('preflight');
    expect(payload.selectedRules).toEqual(['release.version-governance']);

    logSpy.mockRestore();
  });

  it('passes baseline selection through to the verify engine and exposes finding state', async () => {
    const { runVerify } = await import('./verify.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    verifyRepo.mockReturnValue({
      ok: true,
      summary: { failures: 0, warnings: 0, baselineRef: 'main' },
      failures: [],
      warnings: [],
      findingState: {
        artifactPath: '/repo/.playbook/finding-state.json',
        baselineRef: 'main',
        summary: { total: 1, new: 1, existing: 0, resolved: 0, ignored: 0 },
        findings: [
          {
            findingId: 'verify.finding:abc',
            ruleId: 'release.version-governance',
            normalizedLocation: 'release version governance',
            evidenceHash: 'hash',
            state: 'new',
            firstSeenAt: '2026-05-04T00:00:00.000Z',
            lastSeenAt: '2026-05-04T00:00:00.000Z',
            evidenceRefs: ['release version governance']
          }
        ],
        resolved: []
      }
    });

    const exitCode = await runVerify('/repo', {
      format: 'json',
      ci: true,
      quiet: true,
      explain: false,
      policy: false,
      baseline: 'main'
    });

    expect(exitCode).toBe(ExitCode.Success);
    expect(verifyRepo).toHaveBeenCalledWith('/repo', { baselineRef: 'main' });
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.findingState).toMatchObject({
      artifactPath: '/repo/.playbook/finding-state.json',
      baselineRef: 'main',
      summary: { new: 1, existing: 0, resolved: 0, ignored: 0 }
    });

    logSpy.mockRestore();
  });

  it('fails clearly for unsupported verify phases', async () => {
    const { runVerify } = await import('./verify.js');

    await expect(runVerify('/repo', {
      format: 'json',
      ci: true,
      quiet: true,
      explain: false,
      policy: false,
      phase: 'unknown' as never
    })).rejects.toThrow('playbook verify: unsupported phase "unknown". Supported phases: preflight.');

    expect(verifyRepo).not.toHaveBeenCalled();
  });

  it('writes deterministic json artifacts with --out while keeping stdout JSON parseable', async () => {
    const { runVerify } = await import('./verify.js');
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-verify-out-'));
    const outputPath = path.join(repoDir, '.playbook', 'findings.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    verifyRepo.mockReturnValue({
      ok: false,
      summary: { failures: 1, warnings: 0 },
      failures: [{ id: 'requireNotesOnChanges', message: 'notes file not updated', fix: 'add notes' }],
      warnings: []
    });

    const exitCode = await runVerify(repoDir, {
      format: 'json',
      ci: true,
      quiet: true,
      explain: false,
      policy: false,
      outFile: outputPath
    });

    expect(exitCode).toBe(ExitCode.PolicyFailure);
    const stdoutPayload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    const artifactPayload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(artifactPayload.data).toEqual(stdoutPayload);
    expect(typeof artifactPayload.checksum).toBe('string');
    expect(artifactPayload.version).toBe(1);

    const contaminated = `pnpm header\n${fs.readFileSync(outputPath, 'utf8')}`;
    expect(() => JSON.parse(contaminated)).toThrow();

    logSpy.mockRestore();
  });
});

describe('runVerify text next actions', () => {
  beforeEach(() => {
    verifyRepo.mockReset();
    loadConfig.mockReset();
    formatHuman.mockReset();
    loadVerifyRules.mockReset();
    getLatestMutableRun.mockReset();
    createExecutionIntent.mockReset();
    createExecutionRun.mockReset();
    appendExecutionStep.mockReset();
    executionRunPath.mockReset();
    attachSessionRunState.mockReset();
    completeExecutionRun.mockReset();
    resolveLocalVerificationCommand.mockReset();
    runLocalVerification.mockReset();
    formatHuman.mockReturnValue('human report');
    loadConfig.mockReturnValue({ config: { verify: { policy: { rules: [] } } } });
    getLatestMutableRun.mockReturnValue({ id: 'run-test', steps: [] });
    appendExecutionStep.mockReturnValue({ id: 'run-test', steps: [] });
    resolveLocalVerificationCommand.mockReturnValue(null);
    loadVerifyRules.mockResolvedValue([
      {
        id: 'release.version-governance',
        description: 'release governance',
        check: ({ failure }) => failure.id.startsWith('release.'),
        remediation: ['run release plan', 'apply release tasks']
      }
    ]);
  });

  it('prints compact next actions in ci text mode on failure', async () => {
    const { runVerify } = await import('./verify.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    verifyRepo.mockReturnValue({
      ok: false,
      summary: { failures: 1, warnings: 0 },
      failures: [{ id: 'release.requiredVersionBump.missing', message: 'missing version bump' }],
      warnings: []
    });

    const exitCode = await runVerify('/repo', { format: 'text', ci: true, quiet: false, explain: false, policy: false });

    expect(exitCode).toBe(ExitCode.PolicyFailure);
    expect(logSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      'playbook verify: FAIL',
      'Next actions:',
      '- run release plan',
      '- apply release tasks'
    ]);

    logSpy.mockRestore();
  });
});
