import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { captureMemoryEvent } from './index.js';
import { replayMemoryToCandidates } from './replay.js';

const makeRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-memory-replay-'));

describe('temporal memory contracts', () => {
  it('writes deterministic scope-first memory artifacts and keeps them separate from structural graph artifacts', () => {
    const repoRoot = makeRepo();
    fs.mkdirSync(path.join(repoRoot, '.playbook'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, '.playbook', 'repo-index.json'), JSON.stringify({ kind: 'playbook-repo-index' }, null, 2));
    fs.writeFileSync(path.join(repoRoot, '.playbook', 'repo-graph.json'), JSON.stringify({ kind: 'playbook-repo-graph' }, null, 2));

    const event = captureMemoryEvent(repoRoot, {
      kind: 'verify_run',
      scope: { modules: ['packages/engine', 'packages/engine'], ruleIds: ['rule.alpha'] },
      sources: [{ type: 'artifact', reference: '.playbook/findings.json' }],
      riskSummary: { level: 'medium', signals: ['verify-failure'] },
      outcome: { status: 'failure', summary: 'verify failed' },
      salienceInputs: { recurrenceCount: 2, blastRadius: 3 },
      repoRevision: 'test-revision'
    });

    const firstIndex = fs.readFileSync(path.join(repoRoot, '.playbook', 'memory', 'index.json'), 'utf8');
    const secondIndex = fs.readFileSync(path.join(repoRoot, '.playbook', 'memory', 'index.json'), 'utf8');
    expect(secondIndex).toBe(firstIndex);

    const replay = replayMemoryToCandidates(repoRoot);
    expect(replay.replayEvidence).toMatchObject({
      kind: 'playbook-session-replay-evidence',
      authority: { mutation: 'read-only', promotion: 'review-required' },
      memoryIndex: { path: '.playbook/memory/index.json', eventCount: 1 }
    });

    const parsedIndex = JSON.parse(firstIndex) as { kind: string; events: Array<{ eventId: string; relativePath: string; scope: { modules: string[]; ruleIds: string[] } }> };
    expect(parsedIndex.kind).toBe('playbook-temporal-memory-index');
    expect(parsedIndex.events).toHaveLength(1);
    expect(parsedIndex.events[0]).toMatchObject({
      eventId: event.eventId,
      relativePath: `.playbook/memory/events/${event.eventId}.json`,
      scope: { modules: ['packages/engine'], ruleIds: ['rule.alpha'] }
    });

    expect(JSON.parse(fs.readFileSync(path.join(repoRoot, '.playbook', 'repo-index.json'), 'utf8'))).toEqual({ kind: 'playbook-repo-index' });
    expect(JSON.parse(fs.readFileSync(path.join(repoRoot, '.playbook', 'repo-graph.json'), 'utf8'))).toEqual({ kind: 'playbook-repo-graph' });
  });
});
