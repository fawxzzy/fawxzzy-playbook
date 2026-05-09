import { readContractPatternGraph } from './graph.js';
import { readPatternOutcomesArtifact, summarizePatternOutcomeSignals } from './outcomes.js';
import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';
export const runPatternsDoctrineCandidates = (cwd, options) => {
    const graph = readContractPatternGraph(cwd);
    const outcomesArtifact = readPatternOutcomesArtifact(cwd);
    const candidates = graph.patterns
        .map((pattern) => {
        const summary = summarizePatternOutcomeSignals(pattern, outcomesArtifact);
        return {
            patternId: summary.patternId,
            status: pattern.status,
            attractor: summary.signals.attractor,
            fitness: summary.signals.fitness,
            strength: summary.signals.strength,
            outcomes: summary.outcomes
        };
    })
        .filter((pattern) => pattern.status === 'promoted' || pattern.status === 'canonical' || pattern.strength >= 0.75)
        .sort((left, right) => right.strength - left.strength || left.patternId.localeCompare(right.patternId));
    const payload = {
        schemaVersion: '1.0',
        command: 'patterns',
        action: 'doctrine-candidates',
        candidates
    };
    if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
        return ExitCode.Success;
    }
    if (!options.quiet) {
        console.log('Doctrine candidate patterns');
        console.log('──────────────────────────');
        for (const candidate of candidates) {
            console.log(`${candidate.patternId} (${candidate.status}) strength=${candidate.strength.toFixed(2)}`);
        }
    }
    return ExitCode.Success;
};
//# sourceMappingURL=doctrineCandidates.js.map