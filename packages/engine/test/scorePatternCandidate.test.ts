import { describe, expect, it } from 'vitest';
import { scorePatternCandidate } from '../src/compaction/scorePatternCandidate.js';
import type { CompactedPattern } from '../src/compaction/compactPatterns.js';

const fixture: CompactedPattern = {
  id: 'MODULE_TEST_ABSENCE',
  bucket: 'testing',
  occurrences: 4,
  examples: ['module lacks tests', 'coverage gate failed', 'missing test fixture']
};

describe('scorePatternCandidate attractor scoring', () => {
  it('is deterministic for static artifacts', () => {
    const first = scorePatternCandidate(fixture);
    const second = scorePatternCandidate(fixture);

    expect(first).toEqual(second);
  });

  it('exposes stable and explainable score breakdowns', () => {
    const score = scorePatternCandidate(fixture);

    expect(score.attractorScoreBreakdown).toMatchInlineSnapshot(`
      {
        "attractor_score": 0.84,
        "cross_domain_score": 1,
        "evidence_score": 0.75,
        "explanation": "Attractor score ranks representational persistence and utility (recurrence=0.80, cross-domain=1.00, evidence=0.75, reuse=0.80, governance=0.90). It does not claim ontology or truth.",
        "governance_score": 0.9,
        "recurrence_score": 0.8,
        "reuse_score": 0.8,
      }
    `);
    expect(score.attractorScoreBreakdown.explanation).toContain('persistence and utility');
    expect(score.attractorScoreBreakdown.explanation).toContain('does not claim ontology or truth');
  });
});
