import { execFileSync } from 'node:child_process';
import type { RawChangelogChange } from './types.js';

export type CollectGitChangelogChangesOptions = {
  baseRef: string;
  headRef?: string;
  includeMergeCommits?: boolean;
  maxCount?: number;
};

const FIELD_DELIMITER = '\u001f';

function runGit(repoRoot: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    const details = error instanceof Error && 'stderr' in error ? String(error.stderr ?? '').trim() : '';
    const renderedArgs = args.join(' ');
    throw new Error(details ? `git ${renderedArgs} failed: ${details}` : `git ${renderedArgs} failed.`);
  }
}

function ensureRefExists(repoRoot: string, ref: string, label: 'baseRef' | 'headRef'): void {
  try {
    execFileSync('git', ['rev-parse', '--verify', ref], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    const details = error instanceof Error && 'stderr' in error ? String(error.stderr ?? '').trim() : '';
    throw new Error(`Invalid ${label} "${ref}"${details ? `: ${details}` : '.'}`);
  }
}

function parseCommitDetails(output: string): {
  id: string;
  shortId?: string;
  title: string;
  body?: string;
  authorName?: string;
  authorEmail?: string;
  date?: string;
  mergeCommit: boolean;
} {
  const [id, shortId, authorName, authorEmail, date, parents, title, ...bodyParts] = output.split(FIELD_DELIMITER);
  const body = bodyParts.join(FIELD_DELIMITER).trimEnd();

  return {
    id,
    shortId: shortId || undefined,
    title,
    body: body.length > 0 ? body : undefined,
    authorName: authorName || undefined,
    authorEmail: authorEmail || undefined,
    date: date || undefined,
    mergeCommit: parents
      .split(' ')
      .map((value) => value.trim())
      .filter(Boolean).length > 1
  };
}

function parseChangedFiles(output: string): NonNullable<RawChangelogChange['files']> | undefined {
  const files = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [status, ...pathParts] = line.split('\t');
      const filePath = pathParts.join('\t');
      return {
        path: filePath,
        status: status || undefined
      };
    })
    .filter((file) => file.path.length > 0);

  return files.length > 0 ? files : undefined;
}

function getCommitHashes(repoRoot: string, options: Required<Pick<CollectGitChangelogChangesOptions, 'baseRef' | 'headRef' | 'includeMergeCommits'>> & Pick<CollectGitChangelogChangesOptions, 'maxCount'>): string[] {
  const args = ['rev-list', '--reverse'];
  if (!options.includeMergeCommits) {
    args.push('--no-merges');
  }
  args.push(`${options.baseRef}..${options.headRef}`);

  const output = runGit(repoRoot, args).trim();
  const hashes = output.length === 0 ? [] : output.split(/\r?\n/).filter(Boolean);
  return typeof options.maxCount === 'number' ? hashes.slice(0, options.maxCount) : hashes;
}

export function collectGitChangelogChanges(
  repoRoot: string,
  options: CollectGitChangelogChangesOptions
): RawChangelogChange[] {
  const headRef = options.headRef ?? 'HEAD';
  const includeMergeCommits = options.includeMergeCommits ?? false;

  ensureRefExists(repoRoot, options.baseRef, 'baseRef');
  ensureRefExists(repoRoot, headRef, 'headRef');

  const commitHashes = getCommitHashes(repoRoot, {
    baseRef: options.baseRef,
    headRef,
    includeMergeCommits,
    maxCount: options.maxCount
  });

  return commitHashes.map((commitHash) => {
    const detailsOutput = runGit(repoRoot, [
      'show',
      '--quiet',
      `--format=%H${FIELD_DELIMITER}%h${FIELD_DELIMITER}%an${FIELD_DELIMITER}%ae${FIELD_DELIMITER}%aI${FIELD_DELIMITER}%P${FIELD_DELIMITER}%s${FIELD_DELIMITER}%b`,
      commitHash
    ]);
    const details = parseCommitDetails(detailsOutput);
    const files = parseChangedFiles(
      runGit(repoRoot, ['show', '--format=', '--name-status', '--first-parent', '--no-renames', commitHash])
    );

    return {
      id: details.id,
      shortId: details.shortId,
      sourceType: 'commit',
      title: details.title,
      body: details.body,
      author: details.authorName ? { name: details.authorName, email: details.authorEmail } : undefined,
      date: details.date,
      files,
      metadata: {
        mergeCommit: details.mergeCommit
      }
    } satisfies RawChangelogChange;
  });
}
