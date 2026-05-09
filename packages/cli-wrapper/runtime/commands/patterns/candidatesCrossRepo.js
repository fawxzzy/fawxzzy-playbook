import { readCrossRepoPatternsArtifact } from '@zachariahredfield/playbook-engine';
import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';
const toCandidateFamilyRows = (artifact) => artifact.aggregates
    .map((entry) => ({
    pattern_id: entry.pattern_id,
    repo_count: entry.repo_count,
    instance_count: entry.instance_count,
    mean_attractor: entry.mean_attractor,
    mean_fitness: entry.mean_fitness
}))
    .sort((left, right) => right.repo_count - left.repo_count || right.instance_count - left.instance_count || left.pattern_id.localeCompare(right.pattern_id));
export const runPatternsCandidatesCrossRepo = (cwd, options) => {
    const artifact = readCrossRepoPatternsArtifact(cwd);
    const families = toCandidateFamilyRows(artifact);
    const payload = {
        schemaVersion: '1.0',
        command: 'patterns',
        action: 'candidates-cross-repo',
        families
    };
    if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
        return ExitCode.Success;
    }
    if (!options.quiet) {
        console.log('Cross-repo candidate families');
        console.log('─────────────────────────────');
        for (const family of families) {
            console.log(`${family.pattern_id}\trepos ${family.repo_count}\tinstances ${family.instance_count}`);
        }
    }
    return ExitCode.Success;
};
//# sourceMappingURL=candidatesCrossRepo.js.map