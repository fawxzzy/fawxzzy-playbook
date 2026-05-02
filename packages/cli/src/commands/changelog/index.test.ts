import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../../lib/cliContract.js';

const collectGitChangelogChangesSpy = vi.fn();
const classifyChangelogChangesSpy = vi.fn();
const buildChangelogEntriesSpy = vi.fn();
const renderMarkdownChangelogSpy = vi.fn();
const renderJsonChangelogSpy = vi.fn();
const validateChangelogGenerationSpy = vi.fn();
const planChangelogAppendSpy = vi.fn();
const loadChangelogConfigSpy = vi.fn();
const mergeChangelogConfigSpy = vi.fn((value?: unknown) => value ?? {});
const validateChangelogConfigSpy = vi.fn(() => []);

vi.mock('@zachariahredfield/playbook-engine', () => ({
  collectGitChangelogChanges: (...args: unknown[]) => collectGitChangelogChangesSpy(...args),
  classifyChangelogChanges: (...args: unknown[]) => classifyChangelogChangesSpy(...args),
  buildChangelogEntries: (...args: unknown[]) => buildChangelogEntriesSpy(...args),
  renderMarkdownChangelog: (...args: unknown[]) => renderMarkdownChangelogSpy(...args),
  renderJsonChangelog: (...args: unknown[]) => renderJsonChangelogSpy(...args),
  validateChangelogGeneration: (...args: unknown[]) => validateChangelogGenerationSpy(...args),
  planChangelogAppend: (...args: unknown[]) => planChangelogAppendSpy(...args),
  loadChangelogConfig: (...args: unknown[]) => loadChangelogConfigSpy(...args),
  mergeChangelogConfig: (...args: unknown[]) => mergeChangelogConfigSpy(...args),
  validateChangelogConfig: (...args: unknown[]) => validateChangelogConfigSpy(...args)
}));

import { runChangelog } from './index.js';

const createTempRepo = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-changelog-command-'));

describe('runChangelog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    collectGitChangelogChangesSpy.mockReset();
    classifyChangelogChangesSpy.mockReset();
    buildChangelogEntriesSpy.mockReset();
    renderMarkdownChangelogSpy.mockReset();
    renderJsonChangelogSpy.mockReset();
    validateChangelogGenerationSpy.mockReset();
    planChangelogAppendSpy.mockReset();
    loadChangelogConfigSpy.mockReset();
    mergeChangelogConfigSpy.mockClear();
    validateChangelogConfigSpy.mockReset();
    validateChangelogConfigSpy.mockReturnValue([]);
    loadChangelogConfigSpy.mockReturnValue({
      config: {
        includeUnknown: true,
        failOnUnknown: false,
        requireChanges: false,
        lowConfidenceThreshold: 0.3,
        defaultTargetFile: 'docs/CHANGELOG.md'
      },
      path: '.playbook/changelog-config.json',
      exists: false,
      diagnostics: []
    });

    collectGitChangelogChangesSpy.mockReturnValue([
      {
        id: 'abc1234def5678',
        shortId: 'abc1234',
        sourceType: 'commit',
        title: 'feat: add changelog command'
      }
    ]);
    classifyChangelogChangesSpy.mockReturnValue([
      {
        raw: {
          id: 'abc1234def5678',
          shortId: 'abc1234',
          sourceType: 'commit',
          title: 'feat: add changelog command'
        },
        category: 'feature',
        confidence: 1,
        reasons: ['matched conventional commit prefix "feat"'],
        breakingChange: false,
        securityRelated: false
      }
    ]);
    buildChangelogEntriesSpy.mockReturnValue([
      {
        category: 'feature',
        what: 'add changelog command',
        why: 'Adds new capability for users or maintainers.',
        sourceRefs: ['abc1234'],
        breakingChange: false,
        securityRelated: false,
        confidence: 1,
        reasons: ['matched conventional commit prefix "feat"']
      }
    ]);
    renderMarkdownChangelogSpy.mockReturnValue('# Changelog\n\n## Features\n\n- **WHAT:** add changelog command\n  **WHY:** Adds new capability for users or maintainers.\n  Source: abc1234\n');
    renderJsonChangelogSpy.mockReturnValue({
      schemaVersion: '1.0',
      kind: 'playbook-changelog',
      baseRef: 'HEAD~1',
      headRef: 'HEAD',
      sections: []
    });
    validateChangelogGenerationSpy.mockReturnValue({
      schemaVersion: '1.0',
      kind: 'playbook-changelog-validation',
      status: 'pass',
      diagnostics: [],
      summary: {
        entryCount: 1,
        unknownCount: 0,
        lowConfidenceCount: 0,
        breakingChangeCount: 0,
        securityRelatedCount: 0
      }
    });
    planChangelogAppendSpy.mockReturnValue({
      status: 'planned',
      reason: 'Created a new changelog document.',
      content: '# Changelog\n\nnew content\n',
      duplicateDetected: false,
      targetFile: 'docs/CHANGELOG.md',
      diagnostics: []
    });
  });

  it('prints help output', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runChangelog(process.cwd(), ['--help'], {
      format: 'text',
      quiet: false
    });

    expect(exitCode).toBe(ExitCode.Success);
    expect(String(logSpy.mock.calls[0]?.[0])).toContain('Usage: playbook changelog');
  });

  it('fails on unsupported subcommands', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const exitCode = await runChangelog(process.cwd(), ['ship', '--base', 'HEAD~1'], {
      format: 'text',
      quiet: false
    });

    expect(exitCode).toBe(ExitCode.Failure);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('unsupported subcommand');
  });

  it('generates JSON output through engine APIs', async () => {
    const repoRoot = createTempRepo();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runChangelog(repoRoot, ['generate', '--base', 'HEAD~1', '--format', 'json'], {
      format: 'text',
      quiet: false
    });

    expect(exitCode).toBe(ExitCode.Success);
    expect(collectGitChangelogChangesSpy).toHaveBeenCalledWith(repoRoot, {
      baseRef: 'HEAD~1',
      headRef: 'HEAD'
    });
    expect(loadChangelogConfigSpy).toHaveBeenCalledWith(repoRoot, {
      configPath: undefined
    });
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.kind).toBe('playbook-changelog');
  });

  it('writes markdown output to stdout by default', async () => {
    const repoRoot = createTempRepo();
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    const exitCode = await runChangelog(repoRoot, ['generate', '--base', 'HEAD~1'], {
      format: 'text',
      quiet: false
    });

    expect(exitCode).toBe(ExitCode.Success);
    expect(String(stdoutSpy.mock.calls[0]?.[0])).toContain('# Changelog');
  });

  it('returns failure when validation status is fail', async () => {
    const repoRoot = createTempRepo();
    validateChangelogGenerationSpy.mockReturnValue({
      schemaVersion: '1.0',
      kind: 'playbook-changelog-validation',
      status: 'fail',
      diagnostics: [
        {
          id: 'changelog.validation.category.unknown',
          severity: 'error',
          message: 'Unknown changelog entry detected while failOnUnknown is enabled.'
        }
      ],
      summary: {
        entryCount: 1,
        unknownCount: 1,
        lowConfidenceCount: 0,
        breakingChangeCount: 0,
        securityRelatedCount: 0
      }
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runChangelog(repoRoot, ['validate', '--base', 'HEAD~1', '--json'], {
      format: 'json',
      quiet: false
    });

    expect(exitCode).toBe(ExitCode.Failure);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.status).toBe('fail');
  });

  it('returns validation JSON on success', async () => {
    const repoRoot = createTempRepo();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runChangelog(repoRoot, ['validate', '--base', 'HEAD~1', '--json'], {
      format: 'json',
      quiet: false
    });

    expect(exitCode).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.kind).toBe('playbook-changelog-validation');
    expect(payload.status).toBe('pass');
  });

  it('loads config from --config and applies flag overrides after loading', async () => {
    const repoRoot = createTempRepo();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    loadChangelogConfigSpy.mockReturnValue({
      config: {
        includeUnknown: false,
        failOnUnknown: false,
        requireChanges: false,
        lowConfidenceThreshold: 0.2,
        defaultTargetFile: 'docs/CHANGELOG.md'
      },
      path: '.playbook/changelog-config.json',
      exists: true,
      diagnostics: []
    });

    const exitCode = await runChangelog(repoRoot, ['generate', '--base', 'HEAD~1', '--config', '.playbook/changelog-config.json', '--include-unknown', '--format', 'json'], {
      format: 'text',
      quiet: false
    });

    expect(exitCode).toBe(ExitCode.Success);
    expect(loadChangelogConfigSpy).toHaveBeenCalledWith(repoRoot, {
      configPath: '.playbook/changelog-config.json'
    });
    expect(classifyChangelogChangesSpy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        includeUnknown: true,
        lowConfidenceThreshold: 0.2
      })
    );
    JSON.parse(String(logSpy.mock.calls[0]?.[0]));
  });

  it('fails with machine-readable diagnostics for invalid config', async () => {
    const repoRoot = createTempRepo();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    loadChangelogConfigSpy.mockReturnValue({
      config: {
        includeUnknown: true,
        failOnUnknown: false,
        requireChanges: false,
        lowConfidenceThreshold: 0.3,
        defaultTargetFile: 'docs/CHANGELOG.md'
      },
      path: '.playbook/changelog-config.json',
      exists: true,
      diagnostics: [
        {
          id: 'changelog.config.file.parse-failed',
          severity: 'error',
          message: 'Failed to parse changelog config file ".playbook/changelog-config.json".'
        }
      ]
    });

    const exitCode = await runChangelog(repoRoot, ['generate', '--base', 'HEAD~1', '--json'], {
      format: 'json',
      quiet: false
    });

    expect(exitCode).toBe(ExitCode.Failure);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.error).toContain('Failed to parse changelog config file');
    expect(payload.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'changelog.config.file.parse-failed' })
      ])
    );
  });

  it('does not write files during append dry-run', async () => {
    const repoRoot = createTempRepo();
    const targetFile = path.join(repoRoot, 'docs', 'CHANGELOG.md');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const exitCode = await runChangelog(repoRoot, ['append', '--base', 'HEAD~1', '--file', 'docs/CHANGELOG.md', '--dry-run'], {
      format: 'text',
      quiet: false
    });

    expect(exitCode).toBe(ExitCode.Success);
    expect(planChangelogAppendSpy).toHaveBeenCalled();
    expect(fs.existsSync(targetFile)).toBe(false);
  });

  it('writes append content when the plan is safe and dry-run is not requested', async () => {
    const repoRoot = createTempRepo();
    const targetFile = path.join(repoRoot, 'docs', 'CHANGELOG.generated.md');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runChangelog(
      repoRoot,
      ['append', '--base', 'HEAD~1', '--file', 'docs/CHANGELOG.generated.md'],
      {
        format: 'text',
        quiet: false
      }
    );

    expect(exitCode).toBe(ExitCode.Success);
    expect(fs.readFileSync(targetFile, 'utf8')).toBe('# Changelog\n\nnew content\n');
    expect(logSpy.mock.calls.map((call) => String(call[0])).join('\n')).toContain('planned');
  });

  it('returns failure for blocked append plans', async () => {
    const repoRoot = createTempRepo();
    planChangelogAppendSpy.mockReturnValue({
      status: 'blocked',
      reason: 'Managed changelog target is ambiguous without explicit opt-in.',
      content: '',
      duplicateDetected: false,
      targetFile: 'docs/CHANGELOG.md',
      diagnostics: [
        {
          id: 'changelog.append.target.managed',
          severity: 'error',
          message: 'Managed changelog target detected; append is blocked until the caller explicitly opts into the managed target seam.'
        }
      ]
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runChangelog(repoRoot, ['append', '--base', 'HEAD~1', '--file', 'docs/CHANGELOG.md', '--dry-run'], {
      format: 'text',
      quiet: false
    });

    expect(exitCode).toBe(ExitCode.Failure);
    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('blocked');
  });
});
