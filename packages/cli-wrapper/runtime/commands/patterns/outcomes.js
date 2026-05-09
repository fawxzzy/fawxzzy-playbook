import { appendFitnessStrengthScore, computePatternFitness, computePatternStrength } from '@zachariahredfield/playbook-engine';
import fs from 'node:fs';
import path from 'node:path';
import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';
import { readContractPatternGraph } from './graph.js';
const CONTRACT_PATTERN_OUTCOMES_PATH = ['.playbook', 'pattern-outcomes.json'];
export const readPatternOutcomesArtifact = (cwd) => {
    const artifactPath = path.join(cwd, ...CONTRACT_PATTERN_OUTCOMES_PATH);
    if (!fs.existsSync(artifactPath)) {
        throw new Error('playbook patterns: missing artifact at .playbook/pattern-outcomes.json.');
    }
    return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
};
const clamp = (value) => Math.max(0, Math.min(1, Number(value.toFixed(4))));
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const translateDirection = (confidence, direction) => {
    if (direction === 'negative') {
        return clamp(1 - confidence);
    }
    if (direction === 'mixed') {
        return clamp(0.5 + (confidence - 0.5) * 0.5);
    }
    return clamp(confidence);
};
const signalMap = {
    'low-blast-radius': 'outcome_stability',
    'stable-contract-surface': 'architectural_clarity',
    'low-plan-churn': 'outcome_stability',
    'low-governance-violations': 'governance_alignment',
    'deterministic-artifacts': 'cross_repo_success',
    'high-test-pass-stability': 'defect_reduction'
};
const deriveOutcomeLinks = (links) => {
    const buckets = new Map();
    for (const link of links) {
        const target = signalMap[link.outcome_signal];
        const confidence = translateDirection(link.confidence, link.direction);
        const existing = buckets.get(target) ?? [];
        existing.push(confidence);
        buckets.set(target, existing);
    }
    const outcomeLinks = {};
    for (const [signal, values] of buckets.entries()) {
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        outcomeLinks[signal] = clamp(average);
    }
    return outcomeLinks;
};
const inferOutcomes = (patternId, links) => {
    const labels = links
        .filter((link) => link.pattern_id === patternId)
        .map((link) => link.outcome_signal.replace(/-/g, ' '));
    return labels.length > 0 ? labels : ['no linked outcomes'];
};
const findPattern = (cwd, patternId) => {
    const graph = readContractPatternGraph(cwd);
    const pattern = graph.patterns.find((entry) => entry.id === patternId);
    if (!pattern) {
        throw new Error(`playbook patterns outcomes: pattern not found: ${patternId}`);
    }
    return pattern;
};
export const summarizePatternOutcomeSignals = (pattern, outcomesArtifact) => {
    const outcomeLinks = deriveOutcomeLinks(outcomesArtifact.links.filter((link) => link.pattern_id === pattern.id));
    const fitness = computePatternFitness(pattern, outcomeLinks);
    const withFitness = appendFitnessStrengthScore(pattern, fitness, outcomesArtifact.generatedAt);
    const attractor = pattern.scores[pattern.scores.length - 1]?.value ?? 0;
    const strength = computePatternStrength(withFitness);
    return {
        patternId: pattern.id,
        signals: {
            attractor: round2(attractor),
            fitness: round2(fitness.fitness_score),
            strength: round2(strength)
        },
        outcomes: inferOutcomes(pattern.id, outcomesArtifact.links)
    };
};
export const runPatternsOutcomes = (cwd, commandArgs, options) => {
    const patternId = commandArgs[1];
    if (!patternId) {
        throw new Error('playbook patterns outcomes: requires <patternId>.');
    }
    const pattern = findPattern(cwd, patternId);
    const outcomesArtifact = readPatternOutcomesArtifact(cwd);
    const summary = summarizePatternOutcomeSignals(pattern, outcomesArtifact);
    const payload = {
        schemaVersion: '1.0',
        command: 'patterns',
        action: 'outcomes',
        patternId: summary.patternId,
        signals: summary.signals,
        outcomes: summary.outcomes
    };
    if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
        return ExitCode.Success;
    }
    if (!options.quiet) {
        console.log(summary.patternId);
        console.log(`attractor: ${summary.signals.attractor.toFixed(2)}`);
        console.log(`fitness: ${summary.signals.fitness.toFixed(2)}`);
        console.log(`strength: ${summary.signals.strength.toFixed(2)}`);
        console.log('');
        console.log('outcomes:');
        for (const outcome of summary.outcomes) {
            console.log(`- ${outcome}`);
        }
    }
    return ExitCode.Success;
};
//# sourceMappingURL=outcomes.js.map