import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateAiProposal } from '../ai/aiProposal.js';
import { compileInteropRequestDraft, readInteropRequestDraft } from './interopRequestDraft.js';

const createRepo = (name: string): string => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.playbook', 'repo-index.json'), JSON.stringify({ command: 'index' }));
  return repo;
};

describe('compileInteropRequestDraft', () => {
  it('compiles deterministic fitness interop request draft artifact from ai proposal', () => {
    const repo = createRepo('playbook-engine-interop-draft');
    const proposal = generateAiProposal(repo, { target: 'fitness' });
    fs.writeFileSync(path.join(repo, '.playbook', 'ai-proposal.json'), JSON.stringify(proposal, null, 2));

    const compiled = compileInteropRequestDraft(repo);

    expect(compiled.artifactPath).toBe('.playbook/interop-request-draft.json');
    expect(compiled.draft.kind).toBe('interop-request-draft');
    expect(compiled.draft.proposalId).toBe(proposal.proposalId);
    expect(compiled.draft.target).toBe('fitness');
    expect(compiled.draft.action).toBe('adjust_upcoming_workout_load');
    expect(compiled.draft.expected_receipt_type).toBe('schedule_adjustment_applied');
    expect(compiled.draft.provenance_refs).toContain('.playbook/ai-proposal.json');
    expect(compiled.draft.provenance_refs).toContain('playbook-engine:fitnessIntegrationContract');
    expect(fs.existsSync(path.join(repo, '.playbook', 'interop-request-draft.json'))).toBe(true);
  });

  it('rejects non-canonical suggestion fields', () => {
    const repo = createRepo('playbook-engine-interop-draft-invalid');
    const proposal = generateAiProposal(repo, { target: 'fitness' });
    proposal.fitnessRequestSuggestion = {
      ...proposal.fitnessRequestSuggestion!,
      canonicalActionName: 'not_canonical_action' as any
    };
    fs.writeFileSync(path.join(repo, '.playbook', 'ai-proposal.json'), JSON.stringify(proposal, null, 2));

    expect(() => compileInteropRequestDraft(repo)).toThrow(/not part of the canonical Fitness contract/);
  });

  it('reads canonical draft artifact for interop emit path and rejects non-canonical draft path', () => {
    const repo = createRepo('playbook-engine-interop-draft-read');
    const proposal = generateAiProposal(repo, { target: 'fitness' });
    fs.writeFileSync(path.join(repo, '.playbook', 'ai-proposal.json'), JSON.stringify(proposal, null, 2));
    compileInteropRequestDraft(repo);

    const loaded = readInteropRequestDraft(repo, { draftPath: '.playbook/interop-request-draft.json' });
    expect(loaded.artifactPath).toBe('.playbook/interop-request-draft.json');
    expect(loaded.draft.target).toBe('fitness');
    expect(loaded.draft.action).toBe('adjust_upcoming_workout_load');

    expect(() => readInteropRequestDraft(repo, { draftPath: '.playbook/not-canonical-draft.json' })).toThrow(/only canonical/);
  });

  it('rejects draft artifact when expected receipt metadata drifts from canonical fitness contract', () => {
    const repo = createRepo('playbook-engine-interop-draft-drift');
    const proposal = generateAiProposal(repo, { target: 'fitness' });
    fs.writeFileSync(path.join(repo, '.playbook', 'ai-proposal.json'), JSON.stringify(proposal, null, 2));
    compileInteropRequestDraft(repo);
    const draftPath = path.join(repo, '.playbook', 'interop-request-draft.json');
    const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8')) as { expected_receipt_type: string };
    draft.expected_receipt_type = 'drifted_receipt_type';
    fs.writeFileSync(draftPath, JSON.stringify(draft, null, 2));

    expect(() => readInteropRequestDraft(repo, { draftPath: '.playbook/interop-request-draft.json' })).toThrow(/expected receipt type mismatch/);
  });
});
