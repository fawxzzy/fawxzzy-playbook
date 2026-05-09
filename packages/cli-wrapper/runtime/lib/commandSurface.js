import { emitResult, ExitCode } from './cliContract.js';
export const hasHelpFlag = (args) => args.includes('--help') || args.includes('-h');
export const printCommandHelp = (config) => {
    console.log(`Usage: ${config.usage}`);
    console.log('');
    console.log(config.description);
    console.log('');
    console.log('Options:');
    for (const option of config.options) {
        console.log(`  ${option}`);
    }
    if (config.artifacts && config.artifacts.length > 0) {
        console.log('');
        console.log('Owned artifacts:');
        for (const artifact of config.artifacts) {
            console.log(`  - ${artifact}`);
        }
    }
};
export const emitCommandFailure = (command, runtime, failure) => {
    emitResult({
        format: runtime.format,
        quiet: runtime.quiet,
        command,
        ok: false,
        exitCode: ExitCode.Failure,
        summary: failure.summary,
        findings: [{ id: failure.findingId, level: 'error', message: failure.message }],
        nextActions: failure.nextActions ?? []
    });
    return ExitCode.Failure;
};
//# sourceMappingURL=commandSurface.js.map