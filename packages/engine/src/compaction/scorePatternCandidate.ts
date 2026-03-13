import type { CompactedPattern } from './compactPatterns.js';

export type AttractorScoreBreakdown = {
  recurrence_score: number;
  cross_domain_score: number;
  evidence_score: number;
  reuse_score: number;
  governance_score: number;
  attractor_score: number;
  explanation: string;
};

export type PatternCandidateScore = {
  recurrenceCount: number;
  repoSurfaceBreadth: number;
  remediationUsefulness: number;
  canonicalClarity: number;
  falsePositiveRisk: number;
  promotionScore: number;
  confidence: number;
  attractorScoreBreakdown: AttractorScoreBreakdown;
};

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

const computeRepoSurfaceBreadth = (pattern: CompactedPattern): number => {
  const tokenBreadth = new Set(pattern.examples.join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3)).size;
  return clamp(tokenBreadth / 12);
};

const computeEvidenceScore = (pattern: CompactedPattern): number => {
  const uniqueExamples = new Set(pattern.examples.map((example) => example.trim()).filter((example) => example.length > 0)).size;
  return clamp(uniqueExamples / 4);
};

const computeCrossDomainScore = (pattern: CompactedPattern): number => {
  const bucketsById: Record<CompactedPattern['bucket'], number> = {
    testing: 1,
    governance: 0.95,
    architecture: 0.85,
    dependency: 0.75,
    documentation: 0.7
  };

  return bucketsById[pattern.bucket];
};

const computeGovernanceScore = (pattern: CompactedPattern): number => {
  if (pattern.bucket === 'governance') return 1;
  if (pattern.bucket === 'testing') return 0.9;
  if (pattern.bucket === 'architecture') return 0.8;
  if (pattern.bucket === 'dependency') return 0.75;
  return 0.7;
};

const computeRemediationUsefulness = (pattern: CompactedPattern): number => {
  if (pattern.bucket === 'governance' || pattern.bucket === 'testing') return 0.85;
  if (pattern.bucket === 'architecture') return 0.8;
  return 0.65;
};

const computeCanonicalClarity = (pattern: CompactedPattern): number => {
  const idSignal = /^[A-Z0-9_]+$/.test(pattern.id) ? 0.65 : 0.5;
  const exampleSignal = pattern.examples.length > 0 ? 0.25 : 0;
  const lengthSignal = pattern.id.length <= 80 ? 0.1 : 0;
  return clamp(idSignal + exampleSignal + lengthSignal);
};

const computeFalsePositiveRisk = (pattern: CompactedPattern): number => {
  const noisyTokens = ['misc', 'other', 'unknown', 'general'];
  const hasNoisyToken = noisyTokens.some((token) => pattern.id.toLowerCase().includes(token));
  return clamp((hasNoisyToken ? 0.4 : 0.15) + (pattern.occurrences <= 1 ? 0.35 : 0));
};

export const scorePatternCandidate = (pattern: CompactedPattern): PatternCandidateScore => {
  const recurrenceCount = pattern.occurrences;
  const recurrenceSignal = clamp(recurrenceCount / 5);
  const repoSurfaceBreadth = computeRepoSurfaceBreadth(pattern);
  const remediationUsefulness = computeRemediationUsefulness(pattern);
  const canonicalClarity = computeCanonicalClarity(pattern);
  const falsePositiveRisk = computeFalsePositiveRisk(pattern);
  const cross_domain_score = computeCrossDomainScore(pattern);
  const evidence_score = computeEvidenceScore(pattern);
  const reuse_score = clamp((repoSurfaceBreadth + remediationUsefulness) / 2);
  const governance_score = computeGovernanceScore(pattern);

  const attractor_score = clamp(
    recurrenceSignal * 0.3 +
      cross_domain_score * 0.2 +
      evidence_score * 0.2 +
      reuse_score * 0.2 +
      governance_score * 0.1
  );

  const promotionScore = clamp(
    recurrenceSignal * 0.32 +
      repoSurfaceBreadth * 0.2 +
      remediationUsefulness * 0.22 +
      canonicalClarity * 0.18 +
      (1 - falsePositiveRisk) * 0.08
  );

  const confidence = clamp(promotionScore * 0.55 + recurrenceSignal * 0.15 + attractor_score * 0.3);

  const attractorScoreBreakdown: AttractorScoreBreakdown = {
    recurrence_score: Number(recurrenceSignal.toFixed(4)),
    cross_domain_score: Number(cross_domain_score.toFixed(4)),
    evidence_score: Number(evidence_score.toFixed(4)),
    reuse_score: Number(reuse_score.toFixed(4)),
    governance_score: Number(governance_score.toFixed(4)),
    attractor_score: Number(attractor_score.toFixed(4)),
    explanation:
      `Attractor score ranks representational persistence and utility (recurrence=${recurrenceSignal.toFixed(2)}, cross-domain=${cross_domain_score.toFixed(2)}, evidence=${evidence_score.toFixed(2)}, reuse=${reuse_score.toFixed(2)}, governance=${governance_score.toFixed(2)}). It does not claim ontology or truth.`
  };

  return {
    recurrenceCount,
    repoSurfaceBreadth,
    remediationUsefulness,
    canonicalClarity,
    falsePositiveRisk,
    promotionScore,
    confidence,
    attractorScoreBreakdown
  };
};
