import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectGitChangelogChanges } from './gitCollector.js';

type CommitOptions = {
  message: string;
  body?: string;
  filePath: string;
  content: string;
  date: string;
};

const tempDirs: string[] = [];

function runGit(repoRoot: string, args: string[], extraEnv?: Record<string, string>): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv
    }
  });
}

function writeFile(repoRoot: string, relativePath: string, content: string): void {
  const targetPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

function commitFile(repoRoot: string, options: CommitOptions): string {
  writeFile(repoRoot, options.filePath, options.content);
  runGit(repoRoot, ['add', options.filePath]);
  runGit(
    repoRoot,
    ['commit', '-m', options.message, ...(options.body ? ['-m', options.body] : [])],
    {
      GIT_AUTHOR_DATE: options.date,
      GIT_COMMITTER_DATE: options.date
    }
  );
  return runGit(repoRoot, ['rev-parse', 'HEAD']).trim();
}

function createTempRepo(): string {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-changelog-git-'));
  tempDirs.push(repoRoot);
  runGit(repoRoot, ['init', '--initial-branch=main']);
  runGit(repoRoot, ['config', 'user.name', 'Playbook Test']);
  runGit(repoRoot, ['config', 'user.email', 'playbook@example.com']);
  return repoRoot;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('collectGitChangelogChanges', () => {
  it('collects a normal commit range in oldest-to-newest order', () => {
    const repoRoot = createTempRepo();
    const baseCommit = commitFile(repoRoot, {
      message: 'chore: initial state',
      filePath: 'README.md',
      content: 'initial\n',
      date: '2024-01-01T00:00:00Z'
    });

    commitFile(repoRoot, {
      message: 'feat: add engine release lane',
      filePath: 'packages/engine/src/release.ts',
      content: 'export const release = true;\n',
      date: '2024-01-02T00:00:00Z'
    });
    commitFile(repoRoot, {
      message: 'fix: tighten changelog parsing',
      filePath: 'packages/engine/src/release.ts',
      content: 'export const release = false;\n',
      date: '2024-01-03T00:00:00Z'
    });

    const changes = collectGitChangelogChanges(repoRoot, { baseRef: baseCommit });

    expect(changes).toHaveLength(2);
    expect(changes.map((change) => change.title)).toEqual([
      'feat: add engine release lane',
      'fix: tighten changelog parsing'
    ]);
    expect(changes.map((change) => change.date)).toEqual([
      '2024-01-02T00:00:00Z',
      '2024-01-03T00:00:00Z'
    ]);
  });

  it('returns an empty array for an empty range', () => {
    const repoRoot = createTempRepo();
    const baseCommit = commitFile(repoRoot, {
      message: 'chore: initial state',
      filePath: 'README.md',
      content: 'initial\n',
      date: '2024-01-01T00:00:00Z'
    });

    const changes = collectGitChangelogChanges(repoRoot, { baseRef: baseCommit, headRef: baseCommit });

    expect(changes).toEqual([]);
  });

  it('throws a useful error for invalid refs', () => {
    const repoRoot = createTempRepo();
    commitFile(repoRoot, {
      message: 'chore: initial state',
      filePath: 'README.md',
      content: 'initial\n',
      date: '2024-01-01T00:00:00Z'
    });

    expect(() => collectGitChangelogChanges(repoRoot, { baseRef: 'missing-ref' })).toThrow(
      /Invalid baseRef "missing-ref"/
    );
  });

  it('preserves multiline commit bodies', () => {
    const repoRoot = createTempRepo();
    const baseCommit = commitFile(repoRoot, {
      message: 'chore: initial state',
      filePath: 'README.md',
      content: 'initial\n',
      date: '2024-01-01T00:00:00Z'
    });

    commitFile(repoRoot, {
      message: 'feat: add changelog rules',
      body: 'Why: keep release notes deterministic.\n\nRationale: align engine behavior.',
      filePath: 'packages/engine/src/rules.ts',
      content: 'export const rules = [];\n',
      date: '2024-01-02T00:00:00Z'
    });

    const [change] = collectGitChangelogChanges(repoRoot, { baseRef: baseCommit });

    expect(change.body).toBe('Why: keep release notes deterministic.\n\nRationale: align engine behavior.');
  });

  it('collects changed files with statuses', () => {
    const repoRoot = createTempRepo();
    const baseCommit = commitFile(repoRoot, {
      message: 'chore: initial state',
      filePath: 'README.md',
      content: 'initial\n',
      date: '2024-01-01T00:00:00Z'
    });

    writeFile(repoRoot, 'packages/engine/src/one.ts', 'export const one = 1;\n');
    writeFile(repoRoot, 'packages/engine/src/two.ts', 'export const two = 2;\n');
    runGit(repoRoot, ['add', 'packages/engine/src/one.ts', 'packages/engine/src/two.ts']);
    runGit(
      repoRoot,
      ['commit', '-m', 'feat: add multiple files'],
      {
        GIT_AUTHOR_DATE: '2024-01-02T00:00:00Z',
        GIT_COMMITTER_DATE: '2024-01-02T00:00:00Z'
      }
    );

    const [change] = collectGitChangelogChanges(repoRoot, { baseRef: baseCommit });

    expect(change.files).toEqual([
      { path: 'packages/engine/src/one.ts', status: 'A' },
      { path: 'packages/engine/src/two.ts', status: 'A' }
    ]);
  });

  it('filters merge commits by default and includes them when requested', () => {
    const repoRoot = createTempRepo();
    const baseCommit = commitFile(repoRoot, {
      message: 'chore: initial state',
      filePath: 'README.md',
      content: 'initial\n',
      date: '2024-01-01T00:00:00Z'
    });

    runGit(repoRoot, ['checkout', '-b', 'feature/changelog']);
    commitFile(repoRoot, {
      message: 'feat: branch change',
      filePath: 'packages/engine/src/feature.ts',
      content: 'export const feature = true;\n',
      date: '2024-01-02T00:00:00Z'
    });

    runGit(repoRoot, ['checkout', 'main']);
    commitFile(repoRoot, {
      message: 'fix: mainline change',
      filePath: 'packages/engine/src/main.ts',
      content: 'export const mainline = true;\n',
      date: '2024-01-03T00:00:00Z'
    });
    runGit(
      repoRoot,
      ['merge', '--no-ff', 'feature/changelog', '-m', 'merge feature changelog'],
      {
        GIT_AUTHOR_DATE: '2024-01-04T00:00:00Z',
        GIT_COMMITTER_DATE: '2024-01-04T00:00:00Z'
      }
    );

    const withoutMerges = collectGitChangelogChanges(repoRoot, { baseRef: baseCommit });
    const withMerges = collectGitChangelogChanges(repoRoot, {
      baseRef: baseCommit,
      includeMergeCommits: true
    });

    expect(withoutMerges.map((change) => change.title)).toEqual([
      'feat: branch change',
      'fix: mainline change'
    ]);
    expect(withMerges.map((change) => change.title)).toEqual([
      'feat: branch change',
      'fix: mainline change',
      'merge feature changelog'
    ]);
    expect(withMerges.at(-1)?.metadata).toEqual({ mergeCommit: true });
  });

  it('honors maxCount while preserving deterministic ordering', () => {
    const repoRoot = createTempRepo();
    const baseCommit = commitFile(repoRoot, {
      message: 'chore: initial state',
      filePath: 'README.md',
      content: 'initial\n',
      date: '2024-01-01T00:00:00Z'
    });

    commitFile(repoRoot, {
      message: 'feat: first visible change',
      filePath: 'packages/engine/src/first.ts',
      content: 'export const first = 1;\n',
      date: '2024-01-02T00:00:00Z'
    });
    commitFile(repoRoot, {
      message: 'feat: second visible change',
      filePath: 'packages/engine/src/second.ts',
      content: 'export const second = 2;\n',
      date: '2024-01-03T00:00:00Z'
    });
    commitFile(repoRoot, {
      message: 'feat: third visible change',
      filePath: 'packages/engine/src/third.ts',
      content: 'export const third = 3;\n',
      date: '2024-01-04T00:00:00Z'
    });

    const changes = collectGitChangelogChanges(repoRoot, { baseRef: baseCommit, maxCount: 2 });

    expect(changes.map((change) => change.title)).toEqual([
      'feat: first visible change',
      'feat: second visible change'
    ]);
  });
});
