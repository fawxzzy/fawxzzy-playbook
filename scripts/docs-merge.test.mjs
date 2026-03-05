import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const SCRIPT_PATH = path.resolve('scripts/docs-merge.mjs');

function runNode(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function makeFixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-merge-test-'));
  const docsDir = path.join(tmp, 'docs');
  fs.mkdirSync(path.join(docsDir, 'guide'), { recursive: true });

  fs.writeFileSync(
    path.join(docsDir, 'a.md'),
    `# Intro\n\n## Shared Heading\n\nThis is duplicated paragraph text with enough characters to be tracked.\n\nUnique A content.\n`
  );

  fs.writeFileSync(
    path.join(docsDir, 'guide', 'b.md'),
    `# Guide\n\n## Shared Heading\n\nThis is duplicated paragraph text with enough characters to be tracked.\n\nUnique B content.\n`
  );

  return { tmp, docsDir };
}

test('docs-merge dry-run report is deterministic', () => {
  const { tmp, docsDir } = makeFixture();
  try {
    runNode([SCRIPT_PATH, '--dry-run'], tmp);
    const reportPath = path.join(docsDir, 'REPORT_DOCS_MERGE.md');
    const first = fs.readFileSync(reportPath, 'utf8');

    runNode([SCRIPT_PATH, '--dry-run'], tmp);
    const second = fs.readFileSync(reportPath, 'utf8');

    assert.equal(first, second);
    assert.match(first, /Duplicate headings: 1/);
    assert.match(first, /Duplicate blocks: 1/);
    assert.match(first, /docs\/a.md/);
    assert.match(first, /docs\/guide\/b.md/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('docs-merge apply performs safe edits without pruning', () => {
  const { tmp, docsDir } = makeFixture();
  try {
    runNode([SCRIPT_PATH, '--apply'], tmp);

    const bPath = path.join(docsDir, 'guide', 'b.md');
    const edited = fs.readFileSync(bPath, 'utf8');

    assert.match(edited, /docs-merge:canonical-heading/);
    assert.match(edited, /docs-merge:duplicate-block/);
    assert.match(edited, /This is duplicated paragraph text with enough characters to be tracked\./);

    const report = fs.readFileSync(path.join(docsDir, 'REPORT_DOCS_MERGE.md'), 'utf8');
    assert.match(report, /Mode: APPLY/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
