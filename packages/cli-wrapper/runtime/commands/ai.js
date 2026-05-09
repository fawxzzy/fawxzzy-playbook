import { buildChangeScopeBundleFromAiProposal, generateAiProposal, writeChangeScopeArtifact } from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
import { emitJsonOutput } from '../lib/jsonArtifact.js';
const printAiHelp = () => {
    console.log(`Usage: playbook ai <subcommand> [options]

Proposal-only AI command surface.

Subcommands:
  propose                     Emit a deterministic proposal artifact from AI context + contract surfaces

Options (ai propose):
  --include <surface>         Optional canonical artifact summary to reference (plan|review|rendezvous|interop)
  --target <profile>          Proposal target profile (general|fitness)
  --out <path>                Write JSON artifact (for example .playbook/ai-proposal.json)
  --json                      Print machine-readable JSON output
  --help                      Show help`);
};
const parseSubcommand = (args) => args.find((arg) => !arg.startsWith('-')) ?? null;
const parseOptionValues = (args, optionName) => {
    const values = [];
    for (let index = 0; index < args.length; index += 1) {
        if (args[index] !== optionName) {
            continue;
        }
        const value = args[index + 1];
        if (value && !value.startsWith('-')) {
            values.push(value);
        }
    }
    return values;
};
const parseTarget = (args) => {
    const requested = parseOptionValues(args, '--target');
    if (requested.length === 0) {
        return undefined;
    }
    const target = requested[requested.length - 1];
    const allowed = new Set(['general', 'fitness']);
    if (!allowed.has(target)) {
        throw new Error(`playbook ai propose: unsupported --target value: ${target}.`);
    }
    return target;
};
const parseInclude = (args) => {
    const requested = parseOptionValues(args, '--include');
    if (requested.length === 0) {
        return undefined;
    }
    const allowed = new Set(['plan', 'review', 'rendezvous', 'interop']);
    const invalid = requested.filter((entry) => !allowed.has(entry));
    if (invalid.length > 0) {
        throw new Error(`playbook ai propose: unsupported --include value(s): ${invalid.join(', ')}.`);
    }
    return requested;
};
const renderTextSummary = (payload) => {
    console.log('Playbook AI Proposal');
    console.log('');
    console.log(`Proposal ID: ${payload.proposalId}`);
    console.log(`Mode: ${payload.scope.mode}`);
    console.log(`Target: ${payload.scope.target}`);
    console.log(`Recommended governed surface: ${payload.recommendedNextGovernedSurface}`);
    console.log(`Suggested artifact path: ${payload.suggestedArtifactPath}`);
    if (payload.fitnessRequestSuggestion) {
        console.log(`Fitness suggestion action: ${payload.fitnessRequestSuggestion.canonicalActionName}`);
        console.log(`Fitness suggestion next surface: ${payload.fitnessRequestSuggestion.recommendedNextGovernedSurface}`);
    }
    console.log(`Confidence: ${payload.confidence}`);
    console.log('');
    console.log('Reasoning summary');
    for (const line of payload.reasoningSummary) {
        console.log(`- ${line}`);
    }
    if (payload.blockers.length > 0) {
        console.log('');
        console.log('Blockers');
        for (const blocker of payload.blockers) {
            console.log(`- ${blocker}`);
        }
    }
    console.log('');
    console.log('Non-mutation boundaries');
    for (const boundary of payload.scope.boundaries) {
        console.log(`- ${boundary}`);
    }
};
export const runAi = async (cwd, args, options) => {
    if (args.includes('--help') || args.includes('-h') || args.length === 0) {
        printAiHelp();
        return args.length === 0 ? ExitCode.Failure : ExitCode.Success;
    }
    const subcommand = parseSubcommand(args);
    if (subcommand !== 'propose') {
        console.error('playbook ai: unsupported subcommand. Use `playbook ai propose`.');
        return ExitCode.Failure;
    }
    try {
        const payload = generateAiProposal(cwd, {
            include: parseInclude(args),
            target: parseTarget(args)
        });
        const changeScopeBundle = buildChangeScopeBundleFromAiProposal(payload);
        writeChangeScopeArtifact(cwd, changeScopeBundle);
        if (options.format === 'json') {
            emitJsonOutput({
                cwd,
                command: 'ai propose',
                payload,
                outFile: options.outFile
            });
            return ExitCode.Success;
        }
        if (!options.quiet) {
            renderTextSummary(payload);
        }
        return ExitCode.Success;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        return ExitCode.Failure;
    }
};
//# sourceMappingURL=ai.js.map