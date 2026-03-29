const { upsertStickyPrComment } = require('./upsert-sticky-pr-comment.cjs');

const RIGHT_SIDE = 'RIGHT';
const TRANSIENT_HTTP_STATUSES = new Set([502, 503, 504]);
const TRANSIENT_ERROR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNABORTED']);
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_BASE_BACKOFF_MS = 200;
const DEFAULT_JITTER_WINDOW_MS = 73;

const normalizeBody = (body, marker) => String(body || '').replace(marker, '').trim();
const keyForAnnotation = (annotation) => `${annotation.path}:${annotation.line}:${String(annotation.body || '').trim()}`;
const keyForExisting = (comment, marker) => `${comment.path}:${comment.line}:${normalizeBody(comment.body || '', marker)}`;

const parsePatchAddedLines = (patch) => {
  const addedLines = new Set();
  if (typeof patch !== 'string' || patch.length === 0) return addedLines;

  let currentRightLine = 0;
  for (const line of patch.split('\n')) {
    const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunkMatch) {
      currentRightLine = Number(hunkMatch[1]);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.add(currentRightLine);
      currentRightLine += 1;
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      continue;
    }
    currentRightLine += 1;
  }
  return addedLines;
};

const buildDiffAnchorIndex = (files) => {
  const byPath = new Map();
  for (const file of files) {
    if (!file || typeof file.filename !== 'string') continue;
    byPath.set(file.filename, {
      path: file.filename,
      status: file.status,
      rightLines: parsePatchAddedLines(file.patch),
    });
  }
  return byPath;
};

const validateAnnotationAnchor = (annotation, options) => {
  const { anchorIndex, expectedHeadSha, liveHeadSha, side = RIGHT_SIDE } = options;
  if (expectedHeadSha && liveHeadSha && expectedHeadSha !== liveHeadSha) {
    return {
      ok: false,
      reason: `PR head SHA changed before annotation posting (expected ${expectedHeadSha}, live ${liveHeadSha}).`,
    };
  }
  if (!annotation.path || typeof annotation.line !== 'number' || annotation.line <= 0) {
    return { ok: false, reason: 'Annotation is missing a valid file path or target line.' };
  }
  const file = anchorIndex.get(annotation.path);
  if (!file) {
    return { ok: false, reason: 'File is not present in the current PR diff.' };
  }
  if (side !== RIGHT_SIDE) {
    return { ok: false, reason: `Unsupported review side ${side}; only RIGHT is posted by Playbook.` };
  }
  if (!file.rightLines.has(annotation.line)) {
    return { ok: false, reason: `Target line is not resolvable on the ${side} side of the current PR diff.` };
  }
  return { ok: true };
};

const buildFallbackBody = (annotations, marker) => {
  const lines = [
    marker,
    '### Playbook inline annotation fallback',
    '',
    'Inline PR review comments are best-effort. The following findings could not be anchored to the current diff, so they are reported here instead.',
    '',
  ];
  for (const item of annotations) {
    lines.push(`- \`${item.path}:${item.line}\` — ${item.warning}`);
    lines.push(`  - ${item.body}`);
  }
  return lines.join('\n').trimEnd();
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const extractStatus = (error) => error?.status ?? error?.response?.status;
const extractCode = (error) => String(error?.code || error?.cause?.code || '');

const isTransientGitHubError = (error) => {
  const status = extractStatus(error);
  if (TRANSIENT_HTTP_STATUSES.has(status)) return true;
  return TRANSIENT_ERROR_CODES.has(extractCode(error));
};

const isAuthOrPermissionError = (error) => {
  const status = extractStatus(error);
  return status === 401 || status === 403;
};

const deterministicJitterMs = ({ endpoint, prNumber, attempt, windowMs }) => {
  const seed = `${endpoint}:${prNumber}:${attempt}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash % windowMs;
};

async function callGitHubWithRetry({
  operation,
  core,
  endpoint,
  prNumber,
  maxAttempts = DEFAULT_RETRY_ATTEMPTS,
  baseBackoffMs = DEFAULT_BASE_BACKOFF_MS,
  jitterWindowMs = DEFAULT_JITTER_WINDOW_MS,
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const transient = isTransientGitHubError(error);
      const status = extractStatus(error);
      if (!transient || attempt === maxAttempts) {
        if (transient && attempt === maxAttempts) {
          core?.warning?.(
            `::warning::${JSON.stringify({
              event: 'playbook.sidecar.retry.exhausted',
              endpoint,
              pr_number: prNumber,
              retries: maxAttempts,
              status: status ?? null,
              code: extractCode(error) || null,
              degradation: 'skip-comment-sync',
            })}`,
          );
        }
        throw error;
      }

      const backoff = baseBackoffMs * (2 ** (attempt - 1));
      const jitter = deterministicJitterMs({ endpoint, prNumber, attempt, windowMs: jitterWindowMs });
      const waitMs = backoff + jitter;
      core?.info?.(
        JSON.stringify({
          event: 'playbook.sidecar.retry',
          endpoint,
          pr_number: prNumber,
          attempt,
          max_attempts: maxAttempts,
          status: status ?? null,
          code: extractCode(error) || null,
          wait_ms: waitMs,
        }),
      );
      await sleep(waitMs);
    }
  }
  throw new Error('unreachable');
}

async function deleteIssueCommentByMarker({ github, owner, repo, issue_number, marker }) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number,
    per_page: 100,
  });
  const existing = comments.find((comment) => typeof comment.body === 'string' && comment.body.includes(marker));
  if (!existing) return false;
  await github.rest.issues.deleteComment({ owner, repo, comment_id: existing.id });
  return true;
}

async function syncAnalyzePrReviewComments({ github, core, context, diagnostics, marker, fallbackMarker, expectedHeadSha }) {
  const { owner, repo } = context.repo;
  const pull_number = context.issue.number;
  const livePull = await callGitHubWithRetry({
    core,
    endpoint: 'pulls.get',
    prNumber: pull_number,
    operation: () => github.rest.pulls.get({ owner, repo, pull_number }),
  });
  const liveHeadSha = livePull.data.head?.sha;
  const files = await callGitHubWithRetry({
    core,
    endpoint: 'pulls.listFiles',
    prNumber: pull_number,
    operation: () => github.paginate(github.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number,
      per_page: 100,
    }),
  });
  const anchorIndex = buildDiffAnchorIndex(files);

  const reviewComments = await callGitHubWithRetry({
    core,
    endpoint: 'pulls.listReviewComments',
    prNumber: pull_number,
    operation: () => github.paginate(github.rest.pulls.listReviewComments, {
      owner,
      repo,
      pull_number,
      per_page: 100,
    }),
  });
  const playbookComments = reviewComments.filter((comment) =>
    comment.user?.type === 'Bot' && typeof comment.body === 'string' && comment.body.includes(marker),
  );

  const existingByKey = new Map(playbookComments.map((comment) => [keyForExisting(comment, marker), comment]));
  const resolvable = [];
  const fallback = [];

  for (const annotation of diagnostics) {
    if (!annotation.path || typeof annotation.line !== 'number' || !annotation.body) continue;
    const validation = validateAnnotationAnchor(annotation, { anchorIndex, expectedHeadSha, liveHeadSha, side: RIGHT_SIDE });
    if (validation.ok) {
      resolvable.push(annotation);
    } else {
      fallback.push({
        path: annotation.path,
        line: annotation.line,
        body: String(annotation.body).trim(),
        warning: validation.reason,
      });
    }
  }

  const desiredResolvableKeys = new Set(resolvable.map((annotation) => keyForAnnotation(annotation)));
  for (const [existingKey, comment] of existingByKey.entries()) {
    if (desiredResolvableKeys.has(existingKey)) continue;
    await callGitHubWithRetry({
      core,
      endpoint: 'pulls.deleteReviewComment',
      prNumber: pull_number,
      operation: () => github.rest.pulls.deleteReviewComment({ owner, repo, comment_id: comment.id }),
    });
  }

  for (const annotation of resolvable) {
    const desiredKey = keyForAnnotation(annotation);
    if (existingByKey.has(desiredKey)) continue;
    try {
      await callGitHubWithRetry({
        core,
        endpoint: 'pulls.createReviewComment',
        prNumber: pull_number,
        operation: () => github.rest.pulls.createReviewComment({
          owner,
          repo,
          pull_number,
          commit_id: liveHeadSha,
          path: annotation.path,
          line: annotation.line,
          side: RIGHT_SIDE,
          body: `${String(annotation.body).trim()}\n\n${marker}`,
        }),
      });
    } catch (error) {
      const status = error?.status ?? error?.response?.status;
      if (status === 422) {
        fallback.push({
          path: annotation.path,
          line: annotation.line,
          body: String(annotation.body).trim(),
          warning: 'GitHub rejected the inline diff anchor (422 Unprocessable Entity) during review comment creation.',
        });
        core?.warning?.(`Playbook inline annotation fallback for ${annotation.path}:${annotation.line} due to GitHub 422.`);
        continue;
      }
      throw error;
    }
  }

  if (fallback.length > 0) {
    const body = buildFallbackBody(fallback, fallbackMarker);
    const result = await callGitHubWithRetry({
      core,
      endpoint: 'issues.upsertStickyFallbackComment',
      prNumber: pull_number,
      operation: () => upsertStickyPrComment({ github, owner, repo, issue_number: pull_number, marker: fallbackMarker, body }),
    });
    core?.info?.(`Playbook inline fallback comment ${result.action}: ${result.id}`);
  } else {
    const deleted = await callGitHubWithRetry({
      core,
      endpoint: 'issues.deleteFallbackCommentByMarker',
      prNumber: pull_number,
      operation: () => deleteIssueCommentByMarker({ github, owner, repo, issue_number: pull_number, marker: fallbackMarker }),
    });
    if (deleted) core?.info?.('Removed stale Playbook inline fallback comment.');
  }

  if (core?.summary) {
    core.summary.addHeading('Playbook PR annotation delivery', 3);
    core.summary.addRaw(`<p>Inline comments posted: ${resolvable.length - fallback.filter((entry) => entry.warning.includes('422')).length}</p>`);
    core.summary.addRaw(`<p>Fallback comments posted: ${fallback.length}</p>`);
    await core.summary.write();
  }

  return { resolvable, fallback, liveHeadSha, expectedHeadSha };
}

async function runSyncAnalyzePrReviewCommentsSidecar(args) {
  const { core, context } = args;
  try {
    return await syncAnalyzePrReviewComments(args);
  } catch (error) {
    if (isTransientGitHubError(error)) {
      const pullNumber = context?.issue?.number;
      core?.warning?.(
        `Playbook analyze-pr comment sync degraded after transient GitHub API failures (pr=${pullNumber ?? 'unknown'}). Skipping comment sync.`,
      );
      return { degraded: true, reason: 'transient-provider-outage' };
    }
    if (isAuthOrPermissionError(error)) throw error;
    throw error;
  }
}

module.exports = {
  RIGHT_SIDE,
  isTransientGitHubError,
  isAuthOrPermissionError,
  callGitHubWithRetry,
  parsePatchAddedLines,
  buildDiffAnchorIndex,
  validateAnnotationAnchor,
  buildFallbackBody,
  syncAnalyzePrReviewComments,
  runSyncAnalyzePrReviewCommentsSidecar,
};
