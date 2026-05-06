import { generatePatternProposalArtifact, promotePatternProposalToMemory, promotePatternProposalToStory, writePatternProposalArtifact } from '@zachariahredfield/playbook-engine';
import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';
const readOptionValue = (args, flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
};
export const runPatternsProposals = (cwd, commandArgs, options) => {
    const subcommand = commandArgs[0];
    if (subcommand === 'promote') {
        const proposalId = readOptionValue(commandArgs, '--proposal');
        const target = readOptionValue(commandArgs, '--target');
        const repoId = readOptionValue(commandArgs, '--repo');
        if (!proposalId || (target !== 'memory' && target !== 'story')) {
            const payload = { schemaVersion: '1.0', command: 'patterns', action: 'proposals-promote', error: 'Usage: playbook patterns proposals promote --proposal <proposal-id> --target memory|story [--repo <repo-id>] --json' };
            if (options.format === 'json')
                emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
            else
                console.error(payload.error);
            return ExitCode.Failure;
        }
        if (target === 'story' && !repoId) {
            const payload = { schemaVersion: '1.0', command: 'patterns', action: 'proposals-promote', error: 'Story promotion requires --repo <repo-id>.' };
            if (options.format === 'json')
                emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
            else
                console.error(payload.error);
            return ExitCode.Failure;
        }
        const promotion = target === 'memory'
            ? promotePatternProposalToMemory(cwd, proposalId)
            : promotePatternProposalToStory(cwd, proposalId, repoId);
        const payload = { schemaVersion: '1.0', command: 'patterns', action: 'proposals-promote', promotion };
        if (options.format === 'json') {
            emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
            return ExitCode.Success;
        }
        if (!options.quiet)
            console.log(JSON.stringify(payload, null, 2));
        return ExitCode.Success;
    }
    const artifact = generatePatternProposalArtifact(cwd);
    writePatternProposalArtifact(cwd, artifact);
    const payload = {
        schemaVersion: '1.0',
        command: 'patterns',
        action: 'proposals',
        proposals: artifact.proposals
    };
    if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
        return ExitCode.Success;
    }
    if (!options.quiet) {
        console.log('Pattern proposal bridge candidates');
        console.log('────────────────────────────────');
        if (artifact.proposals.length === 0) {
            console.log('none');
        }
        else {
            for (const proposal of artifact.proposals) {
                console.log(`${proposal.proposal_id}\t${proposal.portability_score.toFixed(4)}\t${proposal.target_pattern}`);
            }
        }
    }
    return ExitCode.Success;
};
//# sourceMappingURL=proposals.js.map