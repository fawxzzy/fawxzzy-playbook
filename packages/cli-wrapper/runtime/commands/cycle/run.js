import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ExitCode } from '../../lib/cliContract.js';
import { printCommandHelp } from '../../lib/commandSurface.js';
import { writeJsonArtifactAbsolute } from '../../lib/jsonArtifact.js';
import { createCommandQualityTracker } from '../../lib/commandQuality.js';
import { runVerify } from '../verify.js';
import { runRoute } from '../route.js';
import { runOrchestrate } from '../orchestrate.js';
import { runExecution } from '../execute.js';
import { runTelemetry } from '../telemetry.js';
import { runImprove } from '../improve.js';
import { warn } from '../../lib/output.js';
const isStepName = (value) => typeof value === 'string' && STEP_ORDER.includes(value);
const validateCycleStateArtifact = (artifact) => {
    const errors = [];
    if (typeof artifact.cycle_version !== 'number') {
        errors.push('cycle_version must be a number');
    }
    if (typeof artifact.repo !== 'string') {
        errors.push('repo must be a string');
    }
    if (typeof artifact.cycle_id !== 'string') {
        errors.push('cycle_id must be a string');
    }
    if (typeof artifact.started_at !== 'string') {
        errors.push('started_at must be a string');
    }
    if (artifact.result !== 'success' && artifact.result !== 'failed') {
        errors.push('result must be either success or failed');
    }
    if (!Array.isArray(artifact.steps)) {
        errors.push('steps must be an array');
    }
    else {
        for (const step of artifact.steps) {
            if (!isStepName(step.name)) {
                errors.push('steps[].name must be a valid cycle step');
            }
            if (step.status !== 'success' && step.status !== 'failure') {
                errors.push('steps[].status must be either success or failure');
            }
            if (typeof step.duration_ms !== 'number' || Number.isNaN(step.duration_ms)) {
                errors.push('steps[].duration_ms must be a number');
            }
        }
    }
    if (!Array.isArray(artifact.artifacts_written) || artifact.artifacts_written.some((entry) => typeof entry !== 'string')) {
        errors.push('artifacts_written must be an array of strings');
    }
    if (!Array.isArray(artifact.execution_run_refs) || artifact.execution_run_refs.some((entry) => typeof entry !== 'string')) {
        errors.push('execution_run_refs must be an array of strings');
    }
    if (artifact.result === 'success' && artifact.failed_step !== undefined) {
        errors.push('failed_step must be omitted when result is success');
    }
    if (artifact.result === 'failed') {
        if (!artifact.failed_step || !isStepName(artifact.failed_step)) {
            errors.push('failed_step must be a valid cycle step when result is failed');
        }
    }
    return errors;
};
const CYCLE_STATE_PATH = '.playbook/cycle-state.json';
const CYCLE_HISTORY_PATH = '.playbook/cycle-history.json';
const CYCLE_TASKS_PATH = '.playbook/cycle-tasks.json';
const STEP_ORDER = ['verify', 'route', 'orchestrate', 'execute', 'telemetry', 'improve'];
const STEP_ARTIFACTS = {
    verify: ['.playbook/execution/runs'],
    route: ['.playbook/execution-plan.json'],
    orchestrate: ['.playbook/cycle-tasks.json', '.playbook/orchestrator/orchestrator.json', '.playbook/workset-plan.json', '.playbook/lane-state.json'],
    execute: ['.playbook/execution-state.json', '.playbook/execution-runs'],
    telemetry: ['.playbook/learning-compaction.json'],
    improve: ['.playbook/improvement-candidates.json', '.playbook/command-improvements.json']
};
const nowMs = () => Date.now();
const pathExists = (cwd, relativePath) => fs.existsSync(path.join(cwd, relativePath));
const toPosixRelativePath = (value) => value.replace(/\\/g, '/');
const toCycleArtifact = (repo, cycleId, startedAt, steps, artifactsWritten, executionRunRefs, result, failedStep) => ({
    cycle_version: 1,
    repo,
    cycle_id: cycleId,
    started_at: startedAt,
    steps,
    artifacts_written: artifactsWritten,
    execution_run_refs: executionRunRefs,
    result,
    ...(failedStep ? { failed_step: failedStep } : {})
});
const writeCycleState = (cwd, artifact) => {
    const validationErrors = validateCycleStateArtifact(artifact);
    if (validationErrors.length > 0) {
        warn(`playbook cycle: warning: cycle-state artifact failed schema validation: ${validationErrors.join('; ')}`);
    }
    const targetPath = path.join(cwd, CYCLE_STATE_PATH);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    writeJsonArtifactAbsolute(targetPath, artifact, 'cycle', { envelope: false });
};
const validateCycleHistoryArtifact = (artifact) => {
    const errors = [];
    if (typeof artifact.history_version !== 'number') {
        errors.push('history_version must be a number');
    }
    if (typeof artifact.repo !== 'string') {
        errors.push('repo must be a string');
    }
    if (!Array.isArray(artifact.cycles)) {
        errors.push('cycles must be an array');
        return errors;
    }
    for (const cycle of artifact.cycles) {
        if (typeof cycle.cycle_id !== 'string') {
            errors.push('cycles[].cycle_id must be a string');
        }
        if (typeof cycle.started_at !== 'string') {
            errors.push('cycles[].started_at must be a string');
        }
        if (cycle.result !== 'success' && cycle.result !== 'failed') {
            errors.push('cycles[].result must be either success or failed');
        }
        if (typeof cycle.duration_ms !== 'number' || Number.isNaN(cycle.duration_ms)) {
            errors.push('cycles[].duration_ms must be a number');
        }
        if (cycle.result === 'success' && cycle.failed_step !== undefined) {
            errors.push('cycles[].failed_step must be omitted when result is success');
        }
        if (cycle.result === 'failed' && (!cycle.failed_step || !isStepName(cycle.failed_step))) {
            errors.push('cycles[].failed_step must be a valid cycle step when result is failed');
        }
    }
    return errors;
};
const toCycleHistoryRecord = (artifact) => {
    const durationMs = artifact.steps.reduce((total, step) => total + step.duration_ms, 0);
    return {
        cycle_id: artifact.cycle_id,
        started_at: artifact.started_at,
        result: artifact.result,
        ...(artifact.failed_step ? { failed_step: artifact.failed_step } : {}),
        duration_ms: durationMs
    };
};
const toCycleHistoryArtifact = (repo, cycles) => ({
    history_version: 1,
    repo,
    cycles
});
const readCycleHistoryArtifact = (cwd) => {
    const targetPath = path.join(cwd, CYCLE_HISTORY_PATH);
    if (!fs.existsSync(targetPath)) {
        return null;
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
        if (!Array.isArray(parsed.cycles)) {
            return null;
        }
        return {
            history_version: 1,
            repo: typeof parsed.repo === 'string' ? parsed.repo : cwd,
            cycles: parsed.cycles
                .filter((entry) => typeof entry === 'object' && entry !== null)
                .map((entry) => ({
                cycle_id: String(entry.cycle_id),
                started_at: String(entry.started_at),
                result: entry.result === 'failed' ? 'failed' : 'success',
                ...(typeof entry.failed_step === 'string' ? { failed_step: entry.failed_step } : {}),
                duration_ms: Number(entry.duration_ms)
            }))
        };
    }
    catch {
        return null;
    }
};
const appendCycleHistory = (cwd, cycleState) => {
    const priorHistory = readCycleHistoryArtifact(cwd);
    const nextRecord = toCycleHistoryRecord(cycleState);
    const existingCycles = priorHistory?.cycles ?? [];
    const dedupedCycles = existingCycles.filter((entry) => entry.cycle_id !== nextRecord.cycle_id);
    dedupedCycles.push(nextRecord);
    dedupedCycles.sort((left, right) => {
        const delta = Date.parse(left.started_at) - Date.parse(right.started_at);
        if (Number.isNaN(delta) || delta === 0) {
            return left.cycle_id.localeCompare(right.cycle_id);
        }
        return delta;
    });
    const historyArtifact = toCycleHistoryArtifact(cycleState.repo, dedupedCycles);
    const validationErrors = validateCycleHistoryArtifact(historyArtifact);
    if (validationErrors.length > 0) {
        warn(`playbook cycle: warning: cycle-history artifact failed schema validation: ${validationErrors.join('; ')}`);
    }
    const targetPath = path.join(cwd, CYCLE_HISTORY_PATH);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    writeJsonArtifactAbsolute(targetPath, historyArtifact, 'cycle', { envelope: false });
};
const stepMarker = (status) => (status === 'success' ? '✓' : '✗');
const printCycleText = (artifact, options) => {
    if (options.quiet) {
        return;
    }
    console.log('Playbook Cycle');
    console.log('');
    for (const step of artifact.steps) {
        console.log(`${stepMarker(step.status)} ${step.name}`);
    }
    console.log('');
    console.log(`Cycle status: ${artifact.result.toUpperCase()}`);
};
const runStep = async (cwd, step, stepRunners) => {
    const override = stepRunners?.[step];
    if (override) {
        return override(cwd);
    }
    if (step === 'verify') {
        return runVerify(cwd, { format: 'text', ci: false, quiet: true, explain: false, policy: false });
    }
    if (step === 'route') {
        return runRoute(cwd, ['update command docs for deterministic playbook cycle'], { format: 'text', quiet: true, codexPrompt: false });
    }
    if (step === 'orchestrate') {
        const tasksPath = path.join(cwd, CYCLE_TASKS_PATH);
        fs.mkdirSync(path.dirname(tasksPath), { recursive: true });
        fs.writeFileSync(tasksPath, `${JSON.stringify([{ task_id: 'cycle-task-1', task: 'update command docs for deterministic playbook cycle' }], null, 2)}\n`, 'utf8');
        return runOrchestrate(cwd, {
            format: 'text',
            quiet: true,
            tasksFile: CYCLE_TASKS_PATH,
            lanes: 3,
            outDir: '.playbook/orchestrator',
            artifactFormat: 'json'
        });
    }
    if (step === 'execute') {
        return runExecution(cwd, { format: 'text', quiet: true });
    }
    if (step === 'telemetry') {
        return runTelemetry(cwd, ['learning'], { format: 'text', quiet: true });
    }
    return runImprove(cwd, { format: 'text', quiet: true });
};
export const runCycle = async (cwd, options) => {
    if (options.help) {
        printCommandHelp({
            usage: 'playbook cycle [options]',
            description: 'Run the deterministic execution cycle by orchestrating primitive command handlers.',
            options: ['--no-stop-on-error         Continue running steps after a failure (default: stop on first failure)', '--json                     Alias for --format=json', '--format <text|json>       Output format', '--quiet                    Suppress success output in text mode', '--help                     Show help'],
            artifacts: [CYCLE_STATE_PATH, CYCLE_HISTORY_PATH]
        });
        return ExitCode.Success;
    }
    const tracker = createCommandQualityTracker(cwd, 'cycle');
    const startedAt = new Date().toISOString();
    const cycleId = randomUUID();
    const steps = [];
    const artifactsWritten = [];
    const executionRunRefs = new Set();
    let result = 'success';
    let failedStep;
    let failureExitCode = null;
    let activeStep;
    try {
        for (const step of STEP_ORDER) {
            activeStep = step;
            const startedMs = nowMs();
            const exitCode = await runStep(cwd, step, options.stepRunners);
            const durationMs = nowMs() - startedMs;
            const status = exitCode === ExitCode.Success ? 'success' : 'failure';
            steps.push({ name: step, status, duration_ms: durationMs });
            for (const artifact of STEP_ARTIFACTS[step]) {
                if (pathExists(cwd, artifact)) {
                    artifactsWritten.push(artifact);
                }
            }
            if (step === 'execute') {
                const executionRunsRoot = path.join(cwd, '.playbook', 'execution-runs');
                if (fs.existsSync(executionRunsRoot)) {
                    for (const entry of fs.readdirSync(executionRunsRoot).filter((file) => file.endsWith('.json')).sort((left, right) => left.localeCompare(right))) {
                        executionRunRefs.add(toPosixRelativePath(path.join('.playbook', 'execution-runs', entry)));
                    }
                }
            }
            if (status === 'failure') {
                result = 'failed';
                failedStep = step;
                failureExitCode = exitCode;
                if (options.stopOnError) {
                    break;
                }
            }
        }
    }
    catch (error) {
        result = 'failed';
        failedStep = failedStep ?? activeStep;
        const artifact = toCycleArtifact(cwd, cycleId, startedAt, steps, [...new Set(artifactsWritten)], [...executionRunRefs], result, failedStep);
        writeCycleState(cwd, artifact);
        appendCycleHistory(cwd, artifact);
        tracker.finish({
            inputsSummary: `stop-on-error=${options.stopOnError ? 'true' : 'false'}`,
            artifactsWritten: [CYCLE_STATE_PATH, CYCLE_HISTORY_PATH],
            downstreamArtifactsProduced: [CYCLE_STATE_PATH, CYCLE_HISTORY_PATH],
            successStatus: 'failure',
            warningsCount: 1
        });
        throw error;
    }
    const artifact = toCycleArtifact(cwd, cycleId, startedAt, steps, [...new Set(artifactsWritten)], [...executionRunRefs], result, failedStep);
    writeCycleState(cwd, artifact);
    appendCycleHistory(cwd, artifact);
    if (options.format === 'json') {
        console.log(JSON.stringify(artifact, null, 2));
    }
    else {
        printCycleText(artifact, options);
    }
    const exitCode = failureExitCode ?? ExitCode.Success;
    tracker.finish({
        inputsSummary: `stop-on-error=${options.stopOnError ? 'true' : 'false'}`,
        artifactsWritten: [CYCLE_STATE_PATH, CYCLE_HISTORY_PATH],
        downstreamArtifactsProduced: [CYCLE_STATE_PATH, CYCLE_HISTORY_PATH],
        successStatus: exitCode === ExitCode.Success ? 'success' : 'failure',
        warningsCount: artifact.steps.filter((step) => step.status === 'failure').length
    });
    return exitCode;
};
//# sourceMappingURL=run.js.map