import path from 'node:path';
import * as engineRuntime from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
import { emitJsonOutput } from '../lib/jsonArtifact.js';
import { printCommandHelp } from '../lib/commandSurface.js';
import { renderBriefOutput } from '../lib/briefOutput.js';
const DEFAULT_RESULT_FILE = '.playbook/test-autofix.json';
const DEFAULT_HISTORY_FILE = '.playbook/test-autofix-history.json';
const engine = engineRuntime;
const readRequiredArtifact = (cwd, artifactPath, command) => {
    const absolute = path.resolve(cwd, artifactPath);
    try {
        return engine.readArtifactJson(absolute);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`playbook ${command}: required artifact is missing or invalid at ${artifactPath}. ${message}`);
    }
};
const renderText = (artifact) => {
    const latestBlocked = artifact.blocked_signatures[0];
    const latestReviewRequired = artifact.review_required_signatures[0];
    const latestRetryable = artifact.safe_to_retry_signatures[0];
    const repeatedFailure = artifact.stable_failure_signatures.find((entry) => entry.occurrences > 1);
    const preferredRepair = artifact.preferred_repair_classes[0];
    return renderBriefOutput({
        title: 'Remediation status',
        decision: artifact.latest_run.retry_policy_decision,
        status: `${artifact.latest_run.final_status} on ${artifact.latest_run.run_id}`,
        why: repeatedFailure
            ? `${repeatedFailure.failure_signature} repeated ${repeatedFailure.occurrences} times; retry outlook is ${repeatedFailure.retry_outlook}.`
            : artifact.telemetry.conservative_confidence_signal.reasoning,
        affectedSurfaces: [
            `latest run ${artifact.latest_run.run_id}`,
            `${artifact.blocked_signatures.length} blocked signature(s)`,
            `${artifact.review_required_signatures.length} review-required signature(s)`,
            `${artifact.safe_to_retry_signatures.length} safe-to-retry signature(s)`
        ],
        blockers: [
            latestBlocked ? `blocked: ${latestBlocked}` : '',
            latestReviewRequired ? `review required: ${latestReviewRequired}` : '',
            artifact.telemetry.blocked_low_confidence_runs > 0
                ? `${artifact.telemetry.blocked_low_confidence_runs} blocked_low_confidence run(s)`
                : ''
        ].filter(Boolean),
        nextAction: latestRetryable
            ? `Retry ${latestRetryable}${preferredRepair ? ` with preferred repair class ${preferredRepair.repair_class}` : ''}.`
            : latestBlocked
                ? 'Inspect remediation-status JSON/artifacts before retrying; the current signature is blocked.'
                : 'Continue monitoring remediation history and retry only when a governed safe-to-retry signature appears.',
        artifactRefs: ['.playbook/test-autofix.json', '.playbook/test-autofix-history.json'],
        extraSections: [
            {
                label: 'Operator highlights',
                items: [
                    `Preferred repair class: ${artifact.latest_run.preferred_repair_class ?? '(none)'}`,
                    `Dry-run/apply ratio: ${artifact.telemetry.dry_run_to_apply_ratio}`,
                    `Manual review pressure: ${artifact.telemetry.manual_review_pressure.total_manual_pressure_runs}`
                ]
            },
            {
                label: 'Recent signatures',
                items: [
                    ...artifact.blocked_signatures.slice(0, 2).map((signature) => `blocked ${signature}`),
                    ...artifact.safe_to_retry_signatures.slice(0, 2).map((signature) => `retryable ${signature}`)
                ]
            }
        ]
    });
};
export const runRemediationStatus = async (cwd, options) => {
    if (options.help) {
        printCommandHelp({
            usage: 'playbook remediation-status [--json]',
            description: 'Inspect recent test-autofix remediation history, repeat-policy decisions, and retry guidance without mutating repo state.',
            options: [
                `--latest-result <path>    Read the latest test-autofix result artifact (default ${DEFAULT_RESULT_FILE})`,
                `--history <path>          Read the remediation history artifact (default ${DEFAULT_HISTORY_FILE})`,
                '--json                    Print the full remediation-status read model as JSON',
                '--help                    Show help'
            ],
            artifacts: [DEFAULT_RESULT_FILE, DEFAULT_HISTORY_FILE]
        });
        return ExitCode.Success;
    }
    try {
        const latestResultPath = options.latestResultPath ?? DEFAULT_RESULT_FILE;
        const historyPath = options.historyPath ?? DEFAULT_HISTORY_FILE;
        const latestResult = readRequiredArtifact(cwd, latestResultPath, 'remediation-status');
        const history = readRequiredArtifact(cwd, historyPath, 'remediation-status');
        const artifact = engine.buildRemediationStatusArtifact({
            latestResult,
            history,
            latestResultPath,
            remediationHistoryPath: historyPath
        });
        if (options.format === 'json') {
            emitJsonOutput({ cwd, command: 'remediation-status', payload: artifact });
            return ExitCode.Success;
        }
        if (!options.quiet) {
            console.log(renderText(artifact));
        }
        return ExitCode.Success;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.format === 'json') {
            console.log(JSON.stringify({ schemaVersion: '1.0', command: 'remediation-status', error: message }, null, 2));
        }
        else {
            console.error(message);
        }
        return ExitCode.Failure;
    }
};
//# sourceMappingURL=remediationStatus.js.map