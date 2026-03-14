import fs from 'node:fs';
import path from 'node:path';
import { computePatternFitness, type PatternFitnessSignals, type PatternOutcomeLinks } from './patternFitnessScore.js';
import type { PatternGraphArtifact, PatternGraphPattern } from './patternAttractorScore.js';

const clamp = (value: number): number => Math.max(0, Math.min(1, Number(value.toFixed(4))));
const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const OUTCOMES_SIGNAL_MAP: Record<string, keyof PatternFitnessSignals> = {
  'low-blast-radius': 'outcome_stability',
  'stable-contract-surface': 'architectural_clarity',
  'low-plan-churn': 'outcome_stability',
  'low-governance-violations': 'governance_alignment',
  'deterministic-artifacts': 'cross_repo_success',
  'high-test-pass-stability': 'defect_reduction'
};

type PatternOutcomeDirection = 'positive' | 'negative' | 'mixed';

type PatternOutcomeLink = {
  pattern_id: string;
  outcome_signal: string;
  direction: PatternOutcomeDirection;
  confidence: number;
};

type PatternOutcomesArtifact = {
  generatedAt: string;
  links: PatternOutcomeLink[];
};

export type CrossRepoInput = {
  id: string;
  repoPath: string;
};

export type CrossRepoPatternRepositorySummary = {
  id: string;
  repoPath: string;
  patternCount: number;
  patterns: {
    pattern_id: string;
    attractor: number;
    fitness: number;
    strength: number;
    instance_count: number;
    governance_stable: boolean;
  }[];
};

export type CrossRepoPatternAggregate = {
  pattern_id: string;
  repo_count: number;
  instance_count: number;
  mean_attractor: number;
  mean_fitness: number;
  portability_score: number;
  outcome_consistency: number;
  instance_diversity: number;
  governance_stability: number;
};

export type CrossRepoPatternsArtifact = {
  schemaVersion: '1.0';
  kind: 'cross-repo-patterns';
  generatedAt: string;
  repositories: CrossRepoPatternRepositorySummary[];
  aggregates: CrossRepoPatternAggregate[];
};

const translateDirection = (confidence: number, direction: PatternOutcomeDirection): number => {
  if (direction === 'negative') {
    return clamp(1 - confidence);
  }
  if (direction === 'mixed') {
    return clamp(0.5 + (confidence - 0.5) * 0.5);
  }
  return clamp(confidence);
};

const deriveOutcomeLinks = (links: PatternOutcomeLink[]): PatternOutcomeLinks => {
  const buckets = new Map<keyof PatternFitnessSignals, number[]>();

  for (const link of links) {
    const mapped = OUTCOMES_SIGNAL_MAP[link.outcome_signal];
    if (!mapped) continue;
    const existing = buckets.get(mapped) ?? [];
    existing.push(translateDirection(link.confidence, link.direction));
    buckets.set(mapped, existing);
  }

  const outcomeLinks: PatternOutcomeLinks = {};
  for (const [signal, values] of buckets.entries()) {
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    outcomeLinks[signal] = clamp(avg);
  }
  return outcomeLinks;
};

const readJson = <T>(targetPath: string): T => JSON.parse(fs.readFileSync(targetPath, 'utf8')) as T;

const readPatternGraph = (repoPath: string): PatternGraphArtifact => {
  const graphPath = path.join(repoPath, '.playbook', 'pattern-graph.json');
  if (!fs.existsSync(graphPath)) {
    throw new Error(`playbook patterns cross-repo: missing pattern graph at ${graphPath}`);
  }
  return readJson<PatternGraphArtifact>(graphPath);
};

const readPatternOutcomes = (repoPath: string): PatternOutcomesArtifact | null => {
  const outcomesPath = path.join(repoPath, '.playbook', 'pattern-outcomes.json');
  if (!fs.existsSync(outcomesPath)) {
    return null;
  }
  return readJson<PatternOutcomesArtifact>(outcomesPath);
};

const getAttractor = (pattern: PatternGraphPattern): number =>
  clamp(pattern.scores[pattern.scores.length - 1]?.value ?? 0);

const getFitness = (pattern: PatternGraphPattern, outcomes: PatternOutcomesArtifact | null): number => {
  const explicitFitness = [...pattern.scores].reverse().find((score) => score.signal === 'fitness-strength')?.value;
  if (typeof explicitFitness === 'number') {
    return clamp(explicitFitness);
  }

  if (!outcomes) {
    return computePatternFitness(pattern).fitness_score;
  }

  const outcomeLinks = deriveOutcomeLinks(outcomes.links.filter((link) => link.pattern_id === pattern.id));
  return computePatternFitness(pattern, outcomeLinks).fitness_score;
};

const isGovernanceStable = (pattern: PatternGraphPattern): boolean => pattern.status === 'promoted' || pattern.status === 'canonical';

const stdDev = (values: number[]): number => {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const computePortability = (
  repoCountSignal: number,
  outcomeConsistency: number,
  instanceDiversity: number,
  governanceStability: number
): number => clamp(repoCountSignal * 0.35 + outcomeConsistency * 0.25 + instanceDiversity * 0.2 + governanceStability * 0.2);

export const computeCrossRepoPatternLearning = (repositories: CrossRepoInput[]): CrossRepoPatternsArtifact => {
  const repositorySummaries: CrossRepoPatternRepositorySummary[] = repositories.map((repo) => {
    const graph = readPatternGraph(repo.repoPath);
    const outcomes = readPatternOutcomes(repo.repoPath);

    const patterns = graph.patterns.map((pattern) => {
      const attractor = getAttractor(pattern);
      const fitness = getFitness(pattern, outcomes);
      const strength = clamp(attractor * 0.6 + fitness * 0.4);

      return {
        pattern_id: pattern.id,
        attractor,
        fitness,
        strength,
        instance_count: pattern.instance_refs.length,
        governance_stable: isGovernanceStable(pattern)
      };
    });

    return {
      id: repo.id,
      repoPath: repo.repoPath,
      patternCount: patterns.length,
      patterns
    };
  });

  const allPatterns = new Map<string, CrossRepoPatternRepositorySummary['patterns']>();
  for (const repo of repositorySummaries) {
    for (const pattern of repo.patterns) {
      const existing = allPatterns.get(pattern.pattern_id) ?? [];
      existing.push(pattern);
      allPatterns.set(pattern.pattern_id, existing);
    }
  }

  const repoDenominator = Math.max(repositorySummaries.length, 1);

  const aggregates: CrossRepoPatternAggregate[] = [...allPatterns.entries()].map(([patternId, samples]) => {
    const repoCount = samples.length;
    const instanceCount = samples.reduce((sum, entry) => sum + entry.instance_count, 0);
    const meanAttractor = samples.reduce((sum, entry) => sum + entry.attractor, 0) / repoCount;
    const meanFitness = samples.reduce((sum, entry) => sum + entry.fitness, 0) / repoCount;
    const meanStrength = samples.reduce((sum, entry) => sum + entry.strength, 0) / repoCount;
    const consistencyPenalty = stdDev(samples.map((entry) => entry.strength));
    const outcomeConsistency = clamp(1 - consistencyPenalty * 2);
    const uniqueInstanceCounts = new Set(samples.map((entry) => entry.instance_count)).size;
    const instanceDiversity = clamp(uniqueInstanceCounts / repoCount);
    const governanceStability = clamp(samples.filter((entry) => entry.governance_stable).length / repoCount);
    const repoCountSignal = clamp(repoCount / repoDenominator);
    const portability = computePortability(repoCountSignal, outcomeConsistency, instanceDiversity, governanceStability);

    return {
      pattern_id: patternId,
      repo_count: repoCount,
      instance_count: instanceCount,
      mean_attractor: round2(meanAttractor),
      mean_fitness: round2(meanFitness),
      portability_score: round2(portability),
      outcome_consistency: round2(outcomeConsistency),
      instance_diversity: round2(instanceDiversity),
      governance_stability: round2(governanceStability)
    };
  });

  aggregates.sort((left, right) => right.portability_score - left.portability_score || left.pattern_id.localeCompare(right.pattern_id));

  return {
    schemaVersion: '1.0',
    kind: 'cross-repo-patterns',
    generatedAt: new Date().toISOString(),
    repositories: repositorySummaries,
    aggregates
  };
};

export const writeCrossRepoPatternsArtifact = (cwd: string, artifact: CrossRepoPatternsArtifact): string => {
  const targetPath = path.join(cwd, '.playbook', 'cross-repo-patterns.json');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return targetPath;
};

export const readCrossRepoPatternsArtifact = (cwd: string): CrossRepoPatternsArtifact => {
  const targetPath = path.join(cwd, '.playbook', 'cross-repo-patterns.json');
  if (!fs.existsSync(targetPath)) {
    throw new Error('playbook patterns: missing artifact at .playbook/cross-repo-patterns.json. Run "playbook patterns cross-repo" first.');
  }
  return readJson<CrossRepoPatternsArtifact>(targetPath);
};
