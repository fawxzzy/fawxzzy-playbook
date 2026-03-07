import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';

const createFixtureRepo = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-docs-audit-'));
  fs.mkdirSync(path.join(root, 'docs', 'archive'), { recursive: true });

  const files: Record<string, string> = {
    'AGENTS.md': '# AGENTS\n',
    'docs/PLAYBOOK_PRODUCT_ROADMAP.md': '# Strategic Roadmap\n',
    'docs/PLAYBOOK_IMPROVEMENTS.md': '# Improvements Backlog\n\nSee docs/archive/ for completed items.\n',
    'docs/PLAYBOOK_NOTES.md': '# Notes\n',
    'docs/ARCHITECTURE.md': '# Architecture\n',
    'docs/PLAYBOOK_DEV_WORKFLOW.md': '# Development Workflow\n',
    'docs/index.md': '# Docs Index\n',
    'docs/AI_AGENT_CONTEXT.md': '# AI Context\n',
    'docs/archive/PLAYBOOK_IMPROVEMENTS_2026.md': '# Archived Improvements\n'
  };

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf8');
  }

  return root;
};

describe('runDocs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('detects missing required anchors', async () => {
    const repo = createFixtureRepo();
    fs.rmSync(path.join(repo, 'docs', 'PLAYBOOK_IMPROVEMENTS.md'));
    const { runDocs } = await import('./docs.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runDocs(repo, ['audit'], { ci: false, format: 'json', quiet: true });

    expect(exitCode).toBe(ExitCode.Failure);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'docs.required-anchor.missing', path: 'docs/PLAYBOOK_IMPROVEMENTS.md', level: 'error' })
      ])
    );
  });

  it('detects duplicate roadmap files', async () => {
    const repo = createFixtureRepo();
    fs.writeFileSync(path.join(repo, 'docs', 'ROADMAP.md'), '# old roadmap\n', 'utf8');
    const { runDocs } = await import('./docs.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runDocs(repo, ['audit'], { ci: false, format: 'json', quiet: true });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'docs.single-roadmap.duplicate', path: 'docs/ROADMAP.md', level: 'error' })
      ])
    );
  });

  it('detects idea leakage in non-planning docs', async () => {
    const repo = createFixtureRepo();
    fs.writeFileSync(path.join(repo, 'docs', 'AI_AGENT_CONTEXT.md'), '# AI Context\n\nUpcoming roadmap priorities for next features.\n', 'utf8');
    const { runDocs } = await import('./docs.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runDocs(repo, ['audit'], { ci: false, format: 'json', quiet: true });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'docs.idea-leakage.detected',
          path: 'docs/AI_AGENT_CONTEXT.md',
          level: 'warning',
          suggestedDestination: 'docs/PLAYBOOK_IMPROVEMENTS.md'
        })
      ])
    );
  });

  it('emits stable JSON envelope', async () => {
    const repo = createFixtureRepo();
    const { runDocs } = await import('./docs.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runDocs(repo, ['audit'], { ci: false, format: 'json', quiet: true });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.schemaVersion).toBe('1.0');
    expect(payload.command).toBe('docs audit');
    expect(payload.summary).toEqual(expect.objectContaining({ checksRun: 6 }));
    expect(Array.isArray(payload.findings)).toBe(true);
  });

  it('returns policy failure in ci mode when errors are present', async () => {
    const repo = createFixtureRepo();
    fs.rmSync(path.join(repo, 'docs', 'PLAYBOOK_IMPROVEMENTS.md'));
    const { runDocs } = await import('./docs.js');

    const exitCode = await runDocs(repo, ['audit'], { ci: true, format: 'json', quiet: true });
    expect(exitCode).toBe(ExitCode.PolicyFailure);
  });
});
