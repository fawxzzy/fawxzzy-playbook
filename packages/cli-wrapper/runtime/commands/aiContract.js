import { loadAiContract } from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
const renderText = (result) => {
    console.log('AI Repository Contract');
    console.log('');
    console.log(`Source: ${result.source === 'file' ? 'file-backed (.playbook/ai-contract.json)' : 'generated default'}`);
    console.log('');
    console.log('Runtime');
    console.log(`  ${result.contract.ai_runtime}`);
    console.log('');
    console.log('Workflow');
    console.log(`  ${result.contract.workflow.join(' -> ')}`);
    console.log('');
    console.log('Intelligence Sources');
    console.log(`  Repo index: ${result.contract.intelligence_sources.repoIndex}`);
    console.log(`  Module owners: ${result.contract.intelligence_sources.moduleOwners}`);
    console.log('');
    console.log('Supported Queries');
    for (const query of result.contract.queries) {
        console.log(`  ${query}`);
    }
    console.log('');
    console.log('Remediation');
    console.log(`  Canonical flow: ${result.contract.remediation.canonicalFlow.join(' -> ')}`);
    console.log(`  Diagnostic augmentation: ${result.contract.remediation.diagnosticAugmentation.join(', ')}`);
    console.log('');
    console.log('Rules');
    console.log(`  Require index before query: ${result.contract.rules.requireIndexBeforeQuery ? 'yes' : 'no'}`);
    console.log(`  Prefer Playbook commands over ad hoc inspection: ${result.contract.rules.preferPlaybookCommandsOverAdHocInspection ? 'yes' : 'no'}`);
    console.log(`  Allow direct edits without plan: ${result.contract.rules.allowDirectEditsWithoutPlan ? 'yes' : 'no'}`);
};
export const runAiContract = async (cwd, options) => {
    try {
        const loaded = loadAiContract(cwd);
        const result = {
            schemaVersion: '1.0',
            command: 'ai-contract',
            source: loaded.source,
            contract: loaded.contract
        };
        if (options.format === 'json') {
            console.log(JSON.stringify(result, null, 2));
            return ExitCode.Success;
        }
        if (!options.quiet) {
            renderText(result);
        }
        return ExitCode.Success;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`playbook ai-contract: ${message}`);
        return ExitCode.Failure;
    }
};
//# sourceMappingURL=aiContract.js.map