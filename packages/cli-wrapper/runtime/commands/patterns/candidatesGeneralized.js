import { readCrossRepoPatternsArtifact } from '@zachariahredfield/playbook-engine';
import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';
const toGeneralizedFamilies = (artifact) => artifact.aggregates
    .filter((entry) => entry.repo_count > 1)
    .map((entry) => ({
    pattern_id: entry.pattern_id,
    repo_count: entry.repo_count,
    instance_count: entry.instance_count,
    outcome_consistency_signal: entry.outcome_consistency,
    instance_diversity_signal: entry.instance_diversity,
    governance_stability_signal: entry.governance_stability
}))
    .sort((left, right) => right.repo_count - left.repo_count || right.instance_count - left.instance_count || left.pattern_id.localeCompare(right.pattern_id));
export const runPatternsCandidatesGeneralized = (cwd, options) => {
    const artifact = readCrossRepoPatternsArtifact(cwd);
    const generalized = toGeneralizedFamilies(artifact);
    const payload = {
        schemaVersion: '1.0',
        command: 'patterns',
        action: 'candidates-generalized',
        generalized
    };
    if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
        return ExitCode.Success;
    }
    if (!options.quiet) {
        console.log('Generalized candidate families');
        console.log('──────────────────────────────');
        for (const entry of generalized) {
            console.log(`${entry.pattern_id}\trepos ${entry.repo_count}\tinstances ${entry.instance_count}`);
        }
    }
    return ExitCode.Success;
};
//# sourceMappingURL=candidatesGeneralized.js.map