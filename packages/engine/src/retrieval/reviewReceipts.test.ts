import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readKnowledgeReviewReceiptsArtifact, writeKnowledgeReviewReceipt } from './reviewReceipts.js';

const touchedDirs: string[] = [];

const createTempRepo = (): string => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-review-receipts-'));
  touchedDirs.push(repoRoot);
  return repoRoot;
};

afterEach(() => {
  while (touchedDirs.length > 0) {
    const directory = touchedDirs.pop();
    if (directory && fs.existsSync(directory)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('writeKnowledgeReviewReceipt', () => {
  it('normalizes evidence refs and keeps latest receipt for duplicate receiptId', () => {
    const repoRoot = createTempRepo();

    writeKnowledgeReviewReceipt(repoRoot, {
      receiptId: 'receipt-1',
      queueEntryId: 'queue-1',
      targetKind: 'knowledge',
      targetId: 'k-1',
      sourceSurface: 'memory-knowledge',
      reasonCode: 'stale-active-knowledge',
      decision: 'reaffirm',
      evidenceRefs: ['candidate:c-2', 'candidate:c-1', 'candidate:c-1'],
      decidedAt: '2026-03-24T00:00:00.000Z'
    });

    const artifact = writeKnowledgeReviewReceipt(repoRoot, {
      receiptId: 'receipt-1',
      queueEntryId: 'queue-1',
      targetKind: 'knowledge',
      targetId: 'k-1',
      sourceSurface: 'memory-knowledge',
      reasonCode: 'stale-active-knowledge',
      decision: 'defer',
      evidenceRefs: ['candidate:c-3', 'candidate:c-1'],
      decidedAt: '2026-03-24T01:00:00.000Z'
    });

    expect(artifact.receipts).toHaveLength(1);
    expect(artifact.receipts[0]).toMatchObject({
      receiptId: 'receipt-1',
      queueEntryId: 'queue-1',
      decision: 'defer',
      evidenceRefs: ['candidate:c-1', 'candidate:c-3']
    });

    const reloaded = readKnowledgeReviewReceiptsArtifact(repoRoot);
    expect(reloaded).toEqual(artifact);
  });

  it('requires targetId or path to preserve queue linkage deterministically', () => {
    const repoRoot = createTempRepo();

    expect(() =>
      writeKnowledgeReviewReceipt(repoRoot, {
        queueEntryId: 'queue-2',
        targetKind: 'doc',
        sourceSurface: 'governed-docs',
        reasonCode: 'governed-doc-staleness-window',
        decision: 'revise'
      })
    ).toThrow('receipt requires targetId or path');
  });
});
