import { queryDependencies } from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
const firstPositionalArg = (args) => args.find((arg) => !arg.startsWith('-'));
const printGraph = (graph) => {
    console.log('Dependencies');
    console.log('────────────');
    if (graph.length === 0) {
        console.log('none');
        return;
    }
    for (const moduleEntry of graph) {
        console.log(`${moduleEntry.name}: ${moduleEntry.dependencies.length > 0 ? moduleEntry.dependencies.join(', ') : 'none'}`);
    }
};
export const runDeps = async (cwd, commandArgs, options) => {
    const moduleArg = firstPositionalArg(commandArgs);
    try {
        const payload = queryDependencies(cwd, moduleArg);
        if (options.format === 'json') {
            console.log(JSON.stringify(payload, null, 2));
            return ExitCode.Success;
        }
        if (!options.quiet) {
            if (payload.module) {
                console.log('Dependencies');
                console.log('────────────');
                const deps = payload.dependencies;
                console.log(`${payload.module}: ${deps.length > 0 ? deps.join(', ') : 'none'}`);
            }
            else {
                printGraph(payload.dependencies);
            }
        }
        return ExitCode.Success;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.format === 'json') {
            console.log(JSON.stringify({
                schemaVersion: '1.0',
                command: 'deps',
                module: moduleArg ?? null,
                error: message
            }, null, 2));
        }
        else {
            console.error(message);
        }
        return ExitCode.Failure;
    }
};
//# sourceMappingURL=deps.js.map