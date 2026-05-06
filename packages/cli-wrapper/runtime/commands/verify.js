import * as engine from '@zachariahredfield/playbook-engine';
import { buildResult, emitResult, ExitCode } from '../lib/cliContract.js';
import { emitJsonOutput } from '../lib/jsonArtifact.js';
import { printCommandHelp } from '../lib/commandSurface.js';
import { loadVerifyRules } from '../lib/loadVerifyRules.js';
import { createCommandQualityTracker } from '../lib/commandQuality.js';
const VERIFY_PHASE_RULES = { preflight: ['release.version-governance'] };
const resolveFailureGuidance = (verifyRules, failure) => {
    const rule = verifyRules.find((candidate) => candidate.check({ failure }));
    return {
        explanation: rule?.explanation,
        remediation: rule?.remediation ?? (failure.fix ? [failure.fix] : undefined)
    };
};
const collectNextActions = (report, verifyRules) => {
    const actions = report.failures
        .flatMap((failure) => resolveFailureGuidance(verifyRules, failure).remediation ?? (failure.fix ? [failure.fix] : []))
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    return [...new Set(actions)].slice(0, 4);
};
const printCompactNextActions = (actions) => {
    if (actions.length === 0) {
        return;
    }
    console.log('Next actions:');
    for (const action of actions) {
        console.log(`- ${action}`);
    }
};
const parseRuleIds = (ruleIds) => {
    const normalized = [...new Set((ruleIds ?? []).flatMap((entry) => entry.split(',')).map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
    return normalized.length > 0 ? normalized : undefined;
};
const validateVerifyOptions = (options) => {
    if (options.local && options.localOnly) {
        throw new Error('playbook verify: --local and --local-only cannot be used together.');
    }
    if (options.localOnly && options.policy) {
        throw new Error('playbook verify: --local-only cannot be combined with --policy because policy mode requires governance evaluation.');
    }
    if (options.localOnly && options.phase) {
        throw new Error('playbook verify: --local-only cannot be combined with --phase because phase selection applies to governance evaluation only.');
    }
    if (options.localOnly && options.ruleIds && options.ruleIds.length > 0) {
        throw new Error('playbook verify: --local-only cannot be combined with --rule because rule selection applies to governance evaluation only.');
    }
    if (options.phase && !(options.phase in VERIFY_PHASE_RULES)) {
        const supported = Object.keys(VERIFY_PHASE_RULES).sort().join(', ');
        throw new Error(`playbook verify: unsupported phase "${options.phase}". Supported phases: ${supported}.`);
    }
};
export const collectVerifyReport = async (cwd, options = {}) => engine.verifyRepo(cwd, options);
const resolveRunId = (cwd, requestedRunId) => {
    if (requestedRunId) {
        return requestedRunId;
    }
    const latest = engine.getLatestMutableRun ? engine.getLatestMutableRun(cwd) : null;
    if (latest) {
        return latest.id;
    }
    const intent = engine.createExecutionIntent('verify repository governance', ['repository'], ['deterministic-cli-only-writes'], 'user');
    return engine.createExecutionRun(cwd, intent).id;
};
export const runVerify = async (cwd, options) => {
    if (options.help) {
        printCommandHelp({
            usage: 'playbook verify [options]',
            description: 'Verify repository governance rules and optional policy gating.',
            options: [
                '--phase <name>             Run a named low-cost verify subset (currently: preflight)',
                '--baseline <ref>           Evaluate findings against a baseline ref and persist finding state',
                '--rule <id>                Restrict verify to one or more rule ids (repeatable or comma-separated)',
                '--policy                   Enable policy mode for configured policy rules',
                '--local                    Run repo-defined local verification in addition to governance checks',
                '--local-only               Run only repo-defined local verification and emit a local receipt',
                '--ci                       CI mode summary in text output',
                '--explain                  Show why findings matter and remediation in text mode',
                '--out <path>               Write JSON artifact envelope for verify result',
                '--run-id <id>              Attach verify step to an existing execution run',
                '--json                     Alias for --format=json',
                '--format <text|json>       Output format',
                '--quiet                    Suppress success output in text mode',
                '--help                     Show help'
            ],
            artifacts: ['.playbook/findings*.json (optional via --out)', '.playbook/execution/runs/** (session runtime state)']
        });
        return ExitCode.Success;
    }
    const normalizedRuleIds = parseRuleIds(options.ruleIds);
    validateVerifyOptions({ ...options, ruleIds: normalizedRuleIds });
    const tracker = createCommandQualityTracker(cwd, 'verify');
    const verifyRules = await loadVerifyRules(cwd);
    const { config } = await Promise.resolve(engine.loadConfig(cwd));
    const verificationMode = options.localOnly ? 'local-only' : options.local ? 'combined' : 'governance-only';
    const governanceRequested = !options.localOnly;
    const report = governanceRequested
        ? await collectVerifyReport(cwd, {
            ...(options.baseline ? { baselineRef: options.baseline } : {}),
            ...(options.phase ? { phase: options.phase } : {}),
            ...(normalizedRuleIds ? { ruleIds: normalizedRuleIds } : {})
        })
        : {
            ok: true,
            summary: {
                failures: 0,
                warnings: 0,
                ...(options.baseline ? { baselineRef: options.baseline } : {}),
                ...(options.phase ? { phase: options.phase } : {}),
                ...(normalizedRuleIds ? { ruleIds: normalizedRuleIds } : {})
            },
            failures: [],
            warnings: [],
        };
    const nextActions = governanceRequested ? collectNextActions(report, verifyRules) : [];
    const configuredPolicyRules = new Set(config.verify.policy.rules);
    const policyEvaluation = report.failures
        .map((failure) => {
        const rule = verifyRules.find((candidate) => candidate.check({ failure }));
        if (!rule?.policy) {
            return undefined;
        }
        if (!configuredPolicyRules.has(rule.policy.id)) {
            return undefined;
        }
        return {
            failureId: failure.id,
            policyId: rule.policy.id,
            ruleId: rule.id,
            message: failure.message,
            remediation: rule.remediation ?? (failure.fix ? [failure.fix] : undefined)
        };
    })
        .filter((policy) => Boolean(policy));
    const policyFailureIds = new Set(policyEvaluation.map((policy) => policy.failureId));
    const policyViolations = policyEvaluation
        .map((policy) => ({
        policyId: policy.policyId,
        ruleId: policy.ruleId,
        message: policy.message,
        remediation: policy.remediation
    }))
        .sort((left, right) => {
        const idDiff = left.policyId.localeCompare(right.policyId);
        if (idDiff !== 0) {
            return idDiff;
        }
        return left.message.localeCompare(right.message);
    });
    const inPolicyMode = options.policy;
    const governanceOk = inPolicyMode ? policyViolations.length === 0 : report.ok;
    const localVerification = options.local || options.localOnly
        ? engine.runLocalVerification(cwd, config, {
            mode: options.localOnly ? 'local-only' : 'combined',
            governanceReport: options.localOnly ? undefined : report,
        })
        : null;
    const ok = options.localOnly
        ? localVerification?.receipt.local_verification.status === 'passed'
        : governanceOk && (!localVerification || localVerification.receipt.local_verification.status === 'passed');
    const exitCode = ok ? ExitCode.Success : ExitCode.PolicyFailure;
    const runId = resolveRunId(cwd, options.runId);
    const run = engine.appendExecutionStep(cwd, runId, {
        kind: 'verify',
        status: ok ? 'passed' : 'failed',
        inputs: { policyMode: inPolicyMode, phase: options.phase, ruleIds: normalizedRuleIds, verificationMode },
        outputs: {
            failures: report.failures.length,
            warnings: report.warnings.length,
            ok,
            verificationMode,
            localVerificationStatus: localVerification?.receipt.local_verification.status ?? null,
        },
        evidence: [
            ...(options.outFile ? [{ id: 'evidence-findings-artifact', kind: 'artifact', ref: options.outFile }] : []),
            ...(localVerification ? [
                { id: 'evidence-local-verification-receipt', kind: 'artifact', ref: localVerification.receiptPath },
                { id: 'evidence-local-verification-receipt-log', kind: 'artifact', ref: localVerification.receiptLogPath },
            ] : []),
            ...report.failures.map((failure, index) => ({
                id: `evidence-finding-${String(index + 1).padStart(3, '0')}`,
                kind: 'finding',
                ref: `verify.failure.${failure.id}`,
                note: failure.message
            }))
        ]
    });
    const runArtifactPath = engine.executionRunPath(cwd, runId);
    engine.attachSessionRunState(cwd, {
        step: 'verify',
        runId,
        goal: inPolicyMode ? 'verify repository policy posture' : 'verify repository governance',
        artifacts: [
            { artifact: runArtifactPath, kind: 'run' },
            ...(options.outFile ? [{ artifact: options.outFile, kind: 'finding' }] : []),
            ...(localVerification ? [{ artifact: localVerification.receiptPath, kind: 'finding' }] : []),
        ]
    });
    const hasApplyStep = run.steps.some((step) => step.kind === 'apply');
    if (hasApplyStep) {
        engine.completeExecutionRun(cwd, runId, ok
            ? { status: 'passed', summary: 'Remediation run completed and verification passed.' }
            : { status: 'partial', summary: 'Remediation run completed but verification failed.', failure_cause: 'verification_failed' });
    }
    if (options.format === 'text' && !options.ci && !options.explain && !inPolicyMode) {
        if (options.localOnly) {
            console.log(ok ? 'playbook verify --local-only: PASS' : 'playbook verify --local-only: FAIL');
            if (localVerification) {
                console.log(`Local verification receipt: ${localVerification.receiptPath}`);
                console.log(`Command: ${localVerification.receipt.local_verification.command?.command ?? 'unconfigured'}`);
            }
        }
        else {
            console.log(engine.formatHuman(report));
            if (localVerification) {
                console.log(`Local verification: ${localVerification.receipt.local_verification.status.toUpperCase()}`);
                console.log(`Local verification receipt: ${localVerification.receiptPath}`);
            }
        }
        if (!ok) {
            printCompactNextActions(nextActions);
        }
        tracker.finish({
            inputsSummary: `policy=${inPolicyMode ? 'on' : 'off'}; mode=${verificationMode}; phase=${options.phase ?? 'full'}; rules=${normalizedRuleIds?.join(',') ?? 'all'}`,
            artifactsWritten: [options.outFile, localVerification?.receiptPath, localVerification?.receiptLogPath].filter((entry) => Boolean(entry)),
            downstreamArtifactsProduced: [options.outFile, localVerification?.receiptPath, localVerification?.receiptLogPath].filter((entry) => Boolean(entry)),
            successStatus: ok ? 'success' : 'failure',
            warningsCount: report.warnings.length,
            confidenceScore: ok ? 0.9 : 0.3
        });
        return exitCode;
    }
    if (options.format === 'text' && options.ci && !options.explain && !inPolicyMode) {
        if (!options.quiet || !ok) {
            console.log(options.localOnly
                ? (ok ? 'playbook verify --local-only: PASS' : 'playbook verify --local-only: FAIL')
                : (ok ? 'playbook verify: PASS' : 'playbook verify: FAIL'));
            if (localVerification) {
                console.log(`Local verification: ${localVerification.receipt.local_verification.status}`);
            }
            if (!ok) {
                printCompactNextActions(nextActions);
            }
        }
        tracker.finish({
            inputsSummary: `policy=${inPolicyMode ? 'on' : 'off'}; mode=${verificationMode}; phase=${options.phase ?? 'full'}; rules=${normalizedRuleIds?.join(',') ?? 'all'}`,
            artifactsWritten: [options.outFile, localVerification?.receiptPath, localVerification?.receiptLogPath].filter((entry) => Boolean(entry)),
            downstreamArtifactsProduced: [options.outFile, localVerification?.receiptPath, localVerification?.receiptLogPath].filter((entry) => Boolean(entry)),
            successStatus: ok ? 'success' : 'failure',
            warningsCount: report.warnings.length,
            confidenceScore: ok ? 0.9 : 0.3
        });
        return exitCode;
    }
    const resultPayload = {
        command: 'verify',
        ok,
        exitCode,
        summary: options.localOnly
            ? (ok ? 'Local verification passed.' : 'Local verification failed.')
            : (ok ? 'Verification passed.' : inPolicyMode ? 'Policy verification failed.' : 'Verification failed.'),
        phase: options.phase,
        selectedRules: normalizedRuleIds ?? report.summary.ruleIds,
        findings: [
            ...report.failures.map((failure) => ({
                ...resolveFailureGuidance(verifyRules, failure),
                id: inPolicyMode ? `verify.rule.${failure.id}` : `verify.failure.${failure.id}`,
                level: inPolicyMode ? (policyFailureIds.has(failure.id) ? 'error' : 'info') : 'error',
                message: failure.message,
                evidence: failure.evidence
            })),
            ...report.warnings.map((warning) => ({
                id: `verify.warning.${warning.id}`,
                level: 'warning',
                message: warning.message
            }))
        ],
        findingState: report.findingState,
        nextActions,
        policyViolations: inPolicyMode ? policyViolations : undefined,
        verificationMode,
        workflow: localVerification ? {
            provider: localVerification.receipt.provider,
            verification: localVerification.receipt.workflow.verification,
            publishing: localVerification.receipt.workflow.publishing,
            deployment: localVerification.receipt.workflow.deployment,
        } : undefined,
        localVerification: localVerification ? {
            configured: localVerification.receipt.local_verification.configured,
            status: localVerification.receipt.local_verification.status,
            receiptPath: localVerification.receiptPath,
            receiptLogPath: localVerification.receiptLogPath,
            command: localVerification.receipt.local_verification.command,
            summary: localVerification.receipt.summary,
        } : undefined,
    };
    if (options.format === 'json' && options.outFile) {
        emitJsonOutput({ cwd, command: 'verify', payload: buildResult(resultPayload), outFile: options.outFile });
        tracker.finish({
            inputsSummary: `policy=${inPolicyMode ? 'on' : 'off'}; mode=${verificationMode}; phase=${options.phase ?? 'full'}; rules=${normalizedRuleIds?.join(',') ?? 'all'}`,
            artifactsWritten: [options.outFile, localVerification?.receiptPath, localVerification?.receiptLogPath].filter((entry) => Boolean(entry)),
            downstreamArtifactsProduced: [options.outFile, localVerification?.receiptPath, localVerification?.receiptLogPath].filter((entry) => Boolean(entry)),
            successStatus: ok ? 'success' : 'failure',
            warningsCount: report.warnings.length,
            confidenceScore: ok ? 0.9 : 0.3
        });
        return exitCode;
    }
    emitResult({
        format: options.format,
        quiet: options.quiet,
        explain: options.explain,
        ...resultPayload
    });
    tracker.finish({
        inputsSummary: `policy=${inPolicyMode ? 'on' : 'off'}; mode=${verificationMode}; phase=${options.phase ?? 'full'}; rules=${normalizedRuleIds?.join(',') ?? 'all'}`,
        artifactsWritten: [options.outFile, localVerification?.receiptPath, localVerification?.receiptLogPath].filter((entry) => Boolean(entry)),
        downstreamArtifactsProduced: [options.outFile, localVerification?.receiptPath, localVerification?.receiptLogPath].filter((entry) => Boolean(entry)),
        successStatus: ok ? 'success' : 'failure',
        warningsCount: report.warnings.length,
        confidenceScore: ok ? 0.9 : 0.3
    });
    return exitCode;
};
//# sourceMappingURL=verify.js.map