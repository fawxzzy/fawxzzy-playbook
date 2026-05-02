import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RawChangelogChange } from './types.js';

export type CommitOptions = {
  message: string;
  body?: string;
  filePath: string;
  content: string;
  date: string;
};

const cloneRawChange = (change: RawChangelogChange): RawChangelogChange => ({
  ...change,
  author: change.author ? { ...change.author } : undefined,
  files: change.files?.map((file) => ({ ...file })),
  labels: change.labels ? [...change.labels] : undefined,
  metadata: change.metadata ? { ...change.metadata } : undefined
});

export const repoRootFromEnginePackage = (): string =>
  path.resolve(process.cwd(), '..', '..');

export const createTempGitRepo = (prefix = 'playbook-changelog-pipeline-'): string => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  runGit(repoRoot, ['init', '--initial-branch=main']);
  runGit(repoRoot, ['config', 'user.name', 'Playbook Test']);
  runGit(repoRoot, ['config', 'user.email', 'playbook@example.com']);
  return repoRoot;
};

export const cleanupTempDirs = (directories: string[]): void => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

export const runGit = (
  repoRoot: string,
  args: string[],
  extraEnv?: Record<string, string>
): string =>
  execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv
    }
  });

export const writeRepoFile = (
  repoRoot: string,
  relativePath: string,
  content: string
): void => {
  const targetPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
};

export const commitRepoFile = (
  repoRoot: string,
  options: CommitOptions
): string => {
  writeRepoFile(repoRoot, options.filePath, options.content);
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
};

export const makeRawChangelogFixtures = (): Record<string, RawChangelogChange> => {
  const fixtures: Record<string, RawChangelogChange> = {
    featureCommit: {
      id: '1111111111111111',
      shortId: '1111111',
      sourceType: 'commit',
      title: 'feat: add changelog generator',
      body: 'Why: provide deterministic release notes locally.',
      date: '2026-04-20T12:00:00Z',
      files: [{ path: 'packages/cli/src/commands/changelog/index.ts', status: 'M' }]
    },
    fixCommit: {
      id: '2222222222222222',
      shortId: '2222222',
      sourceType: 'commit',
      title: 'fix: correct markdown ordering',
      date: '2026-04-21T12:00:00Z',
      files: [{ path: 'packages/engine/src/release/changelog/markdownRenderer.ts', status: 'M' }]
    },
    docsOnlyChange: {
      id: '3333333333333333',
      shortId: '3333333',
      sourceType: 'commit',
      title: 'refresh release guide',
      date: '2026-04-22T12:00:00Z',
      files: [{ path: 'docs/RELEASING.md', status: 'M' }]
    },
    refactorChange: {
      id: '4444444444444444',
      shortId: '4444444',
      sourceType: 'commit',
      title: 'refactor: split changelog pipeline helpers',
      date: '2026-04-23T12:00:00Z',
      files: [{ path: 'packages/engine/src/release/changelog/testHelpers.ts', status: 'A' }]
    },
    infraChange: {
      id: '5555555555555555',
      shortId: '5555555',
      sourceType: 'commit',
      title: 'ci: tighten docs pipeline',
      date: '2026-04-24T12:00:00Z',
      files: [{ path: '.github/workflows/docs.yml', status: 'M' }]
    },
    securityChange: {
      id: '6666666666666666',
      shortId: '6666666',
      sourceType: 'commit',
      title: 'tighten token handling in release sync',
      body: 'Mitigates token leak risk during changelog publication.',
      labels: ['security'],
      date: '2026-04-25T12:00:00Z',
      files: [{ path: 'packages/engine/src/release/index.ts', status: 'M' }]
    },
    performanceChange: {
      id: '7777777777777777',
      shortId: '7777777',
      sourceType: 'commit',
      title: 'perf: reduce classifier latency',
      date: '2026-04-26T12:00:00Z',
      files: [{ path: 'packages/engine/src/release/changelog/classifier.ts', status: 'M' }]
    },
    breakingChange: {
      id: '8888888888888888',
      shortId: '8888888',
      sourceType: 'commit',
      title: 'feat!: remove deprecated changelog alias',
      body: 'BREAKING CHANGE: remove the legacy alias from release scripts.',
      date: '2026-04-27T12:00:00Z',
      files: [{ path: 'packages/cli/src/commands/changelog.ts', status: 'M' }]
    },
    unknownChange: {
      id: '9999999999999999',
      shortId: '9999999',
      sourceType: 'commit',
      title: 'adjust release copy',
      date: '2026-04-28T12:00:00Z',
      files: [{ path: 'notes/release-copy.txt', status: 'M' }]
    },
    multilineWhyChange: {
      id: 'aaaaaaaaaaaaaaaa',
      shortId: 'aaaaaaa',
      sourceType: 'commit',
      title: 'feat: add repo config loading',
      body: 'Why: keep repo rules centralized.\n\nRationale: avoid CLI-specific semantics.',
      date: '2026-04-29T12:00:00Z',
      files: [{ path: 'packages/engine/src/release/changelog/configLoader.ts', status: 'A' }]
    },
    labelDrivenChange: {
      id: 'bbbbbbbbbbbbbbbb',
      shortId: 'bbbbbbb',
      sourceType: 'commit',
      title: 'stabilize release signal',
      labels: ['docs'],
      date: '2026-04-30T12:00:00Z',
      files: [{ path: 'packages/engine/src/release/changelog/types.ts', status: 'M' }]
    },
    weakPathFallbackChange: {
      id: 'cccccccccccccccc',
      shortId: 'ccccccc',
      sourceType: 'commit',
      title: 'touch engine helper',
      date: '2026-05-01T12:00:00Z',
      files: [{ path: 'packages/engine/src/helper.ts', status: 'M' }]
    },
    mergeCommitChange: {
      id: 'dddddddddddddddd',
      shortId: 'ddddddd',
      sourceType: 'commit',
      title: 'merge feature changelog',
      date: '2026-05-02T12:00:00Z',
      metadata: { mergeCommit: true },
      files: [{ path: 'packages/engine/src/release/changelog/index.ts', status: 'M' }]
    }
  };

  return Object.fromEntries(
    Object.entries(fixtures).map(([key, value]) => [key, cloneRawChange(value)])
  );
};

export const makeSimpleChangelog = (): string =>
  '# Changelog\n\nHistorical notes.\n';

export const makeManagedChangelog = (): string =>
  [
    '# Changelog',
    '',
    '<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_START -->',
    '## 1.0.0 - 2026-05-02',
    '<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_END -->'
  ].join('\n');

export const makeManagedChangelogWithGeneratedSeam = (): string =>
  [
    '# Changelog',
    '',
    '<!-- PLAYBOOK:GENERATED_CHANGELOG_START -->',
    '<!-- PLAYBOOK:CHANGELOG_GENERATED base=v0.9.0 head=HEAD -->',
    'old generated content',
    '<!-- PLAYBOOK:GENERATED_CHANGELOG_END -->',
    '',
    '<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_START -->',
    '## 1.0.0 - 2026-05-02',
    '<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_END -->'
  ].join('\n');
