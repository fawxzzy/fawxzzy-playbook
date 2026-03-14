import path from 'node:path';
import {
  computeCrossRepoPatternLearning,
  readCrossRepoPatternsArtifact,
  writeCrossRepoPatternsArtifact,
  type CrossRepoInput,
  type CrossRepoPatternsArtifact
} from '@zachariahredfield/playbook-engine';
import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';

type PatternsOptions = {
  format: 'text' | 'json';
  quiet: boolean;
  outFile?: string;
};

const DEFAULT_PILOT_REPOS = [
  'ZachariahRedfield/playbook',
  'ZachariahRedfield/fawxzzy-fitness'
] as const;

const parseRepoArgs = (cwd: string, commandArgs: string[]): CrossRepoInput[] => {
  const repos: CrossRepoInput[] = [];

  for (let index = 0; index < commandArgs.length; index += 1) {
    if (commandArgs[index] !== '--repo') continue;
    const value = commandArgs[index + 1];
    if (!value) continue;

    const looksLikePath = value.startsWith('.') || value.startsWith('/') || value.startsWith('..');
    const isGithubSlug = !looksLikePath && value.includes('/');
    repos.push({
      id: isGithubSlug ? value : path.basename(value),
      repoPath: isGithubSlug ? path.resolve(cwd, '..', value.split('/')[1] ?? value) : path.resolve(cwd, value)
    });
  }

  if (repos.length > 0) {
    return repos;
  }

  return DEFAULT_PILOT_REPOS.map((slug) => {
    const [, repo] = slug.split('/');
    return {
      id: slug,
      repoPath: path.resolve(cwd, '..', repo ?? slug)
    };
  });
};

const toPortabilityRows = (artifact: CrossRepoPatternsArtifact) =>
  artifact.aggregates.map((entry: any) => ({ pattern_id: entry.pattern_id, portability_score: entry.portability_score }));

const toGeneralizedRows = (artifact: CrossRepoPatternsArtifact) =>
  artifact.aggregates.filter((entry: any) => entry.portability_score > 0.85);

const classifyPortability = (score: number): string => {
  if (score > 0.85) return 'portable doctrine candidate';
  if (score >= 0.6) return 'strong pattern';
  if (score >= 0.3) return 'context dependent';
  return 'repo-local pattern';
};

const computeRepoDelta = (artifact: CrossRepoPatternsArtifact, leftRepo: string, rightRepo: string) => {
  const left = artifact.repositories.find((repo: any) => repo.id === leftRepo);
  const right = artifact.repositories.find((repo: any) => repo.id === rightRepo);
  if (!left || !right) {
    throw new Error(`playbook patterns repo-delta: repositories must exist in artifact (got: ${leftRepo}, ${rightRepo})`);
  }

  const rightByPattern = new Map<string, any>(right.patterns.map((entry: any) => [entry.pattern_id, entry]));
  return left.patterns
    .filter((entry: any) => rightByPattern.has(entry.pattern_id))
    .map((entry: any) => {
      const rhs = rightByPattern.get(entry.pattern_id)!;
      return {
        pattern_id: entry.pattern_id,
        left_repo: leftRepo,
        right_repo: rightRepo,
        strength_delta: Number((entry.strength - rhs.strength).toFixed(2)),
        attractor_delta: Number((entry.attractor - rhs.attractor).toFixed(2)),
        fitness_delta: Number((entry.fitness - rhs.fitness).toFixed(2))
      };
    })
    .sort((a: any, b: any) => Math.abs(b.strength_delta) - Math.abs(a.strength_delta) || a.pattern_id.localeCompare(b.pattern_id));
};

export const runPatternsCrossRepo = (cwd: string, commandArgs: string[], options: PatternsOptions): number => {
  const repositories = parseRepoArgs(cwd, commandArgs.slice(1));
  const artifact = computeCrossRepoPatternLearning(repositories);
  writeCrossRepoPatternsArtifact(cwd, artifact);

  const payload = {
    schemaVersion: '1.0',
    command: 'patterns',
    action: 'cross-repo',
    repositories: repositories.map((repo: any) => repo.id),
    aggregates: artifact.aggregates
  };

  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
    return ExitCode.Success;
  }

  if (!options.quiet) {
    for (const entry of artifact.aggregates) {
      console.log(`${entry.pattern_id}\t${entry.portability_score.toFixed(2)}`);
    }
  }

  return ExitCode.Success;
};

export const runPatternsPortability = (cwd: string, options: PatternsOptions): number => {
  const artifact = readCrossRepoPatternsArtifact(cwd);
  const portability = toPortabilityRows(artifact);

  const payload = { schemaVersion: '1.0', command: 'patterns', action: 'portability', portability };
  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
    return ExitCode.Success;
  }

  if (!options.quiet) {
    for (const entry of portability) {
      console.log(`${entry.pattern_id}\t${entry.portability_score.toFixed(2)}`);
    }
  }
  return ExitCode.Success;
};

export const runPatternsGeneralized = (cwd: string, options: PatternsOptions): number => {
  const artifact = readCrossRepoPatternsArtifact(cwd);
  const generalized = toGeneralizedRows(artifact).map((entry: any) => ({
    ...entry,
    interpretation: classifyPortability(entry.portability_score)
  }));

  const payload = { schemaVersion: '1.0', command: 'patterns', action: 'generalized', generalized };

  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
    return ExitCode.Success;
  }

  if (!options.quiet) {
    for (const entry of generalized) {
      console.log(`${entry.pattern_id}\t${entry.portability_score.toFixed(2)}\t${entry.interpretation}`);
    }
  }

  return ExitCode.Success;
};

export const runPatternsRepoDelta = (cwd: string, commandArgs: string[], options: PatternsOptions): number => {
  const leftRepo = commandArgs[1];
  const rightRepo = commandArgs[2];

  if (!leftRepo || !rightRepo) {
    throw new Error('playbook patterns repo-delta: requires <leftRepo> <rightRepo>.');
  }

  const artifact = readCrossRepoPatternsArtifact(cwd);
  const deltas = computeRepoDelta(artifact, leftRepo, rightRepo);

  const payload = {
    schemaVersion: '1.0',
    command: 'patterns',
    action: 'repo-delta',
    leftRepo,
    rightRepo,
    deltas
  };

  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
    return ExitCode.Success;
  }

  if (!options.quiet) {
    for (const delta of deltas) {
      console.log(`${delta.pattern_id}\tstrength ${delta.strength_delta.toFixed(2)}\tattractor ${delta.attractor_delta.toFixed(2)}\tfitness ${delta.fitness_delta.toFixed(2)}`);
    }
  }

  return ExitCode.Success;
};
