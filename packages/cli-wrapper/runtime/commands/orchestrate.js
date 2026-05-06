import fs from 'node:fs';
import path from 'node:path';
import { compileOrchestratorArtifacts, recordLaneTransition, safeRecordRepositoryEvent } from '@zachariahredfield/playbook-engine';
import { emitResult, ExitCode } from '../lib/cliContract.js';
import { printCommandHelp } from '../lib/commandSurface.js';
import { createCommandQualityTracker } from '../lib/commandQuality.js';
const WORKSET_PLAN_PATH = '.playbook/workset-plan.json';
const LANE_STATE_PATH = '.playbook/lane-state.json';
const parseTasksInput = (raw) => {
    if (!Array.isArray(raw))
        return undefined;
    const tasks = raw
        .map((entry) => {
        if (!entry || typeof entry !== 'object')
            return undefined;
        const candidate = entry;
        const task_id = typeof candidate.task_id === 'string' ? candidate.task_id.trim() : '';
        const task = typeof candidate.task === 'string' ? candidate.task.trim() : '';
        if (!task_id || !task)
            return undefined;
        return { task_id, task };
    })
        .filter((entry) => Boolean(entry));
    return tasks.length > 0 ? tasks : undefined;
};
export const runOrchestrate = async (cwd, options) => {
    if (options.help) {
        printCommandHelp({
            usage: 'playbook orchestrate (--goal <goal> | --tasks-file <path>) [options]',
            description: 'Generate deterministic orchestration artifacts from a goal or tasks-file workset.',
            options: ['--goal <string>            Orchestration goal when tasks-file is not provided', '--tasks-file <path>        JSON tasks input [{task_id,task}] or {tasks:[...]}', '--lanes <n>                Number of parallel lanes (default: 3)', '--out-dir <path>           Output directory for orchestration artifacts', '--format <md|json|both>    Artifact format for goal-mode orchestration', '--json                     Alias for --format=json output', '--quiet                    Suppress success output in text mode', '--help                     Show help'],
            artifacts: [WORKSET_PLAN_PATH + ' (write for tasks-file mode)', LANE_STATE_PATH + ' (write for tasks-file mode)', '.playbook/orchestrator/** (write for goal mode)']
        });
        return ExitCode.Success;
    }
    const tracker = createCommandQualityTracker(cwd, 'orchestrate');
    const tasksFile = options.tasksFile?.trim();
    if (tasksFile) {
        const tasksPath = path.resolve(cwd, tasksFile);
        if (!fs.existsSync(tasksPath)) {
            emitResult({
                format: options.format,
                quiet: options.quiet,
                command: 'orchestrate',
                ok: false,
                exitCode: ExitCode.Failure,
                summary: `Orchestration failed: tasks file not found at ${tasksFile}.`,
                findings: [{ id: 'orchestrate.tasks-file.missing', level: 'error', message: `Missing tasks file: ${tasksFile}` }],
                nextActions: ['Run `playbook orchestrate --tasks-file <path>` with a valid JSON file.']
            });
            tracker.finish({ inputsSummary: `tasks-file=${tasksFile}`, artifactsRead: [tasksFile], successStatus: 'failure', warningsCount: 1 });
            return ExitCode.Failure;
        }
        let parsed;
        try {
            parsed = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
        }
        catch {
            emitResult({
                format: options.format,
                quiet: options.quiet,
                command: 'orchestrate',
                ok: false,
                exitCode: ExitCode.Failure,
                summary: 'Orchestration failed: tasks file is not valid JSON.',
                findings: [{ id: 'orchestrate.tasks-file.parse-error', level: 'error', message: `Unable to parse JSON tasks file: ${tasksFile}` }],
                nextActions: ['Ensure the tasks file is valid JSON and retry.']
            });
            tracker.finish({ inputsSummary: `tasks-file=${tasksFile}`, artifactsRead: [tasksFile], successStatus: 'failure', warningsCount: 1 });
            return ExitCode.Failure;
        }
        const tasks = parseTasksInput(parsed?.tasks ?? parsed);
        if (!tasks) {
            emitResult({
                format: options.format,
                quiet: options.quiet,
                command: 'orchestrate',
                ok: false,
                exitCode: ExitCode.Failure,
                summary: 'Orchestration failed: tasks file must contain a non-empty task list.',
                findings: [{ id: 'orchestrate.tasks-file.invalid', level: 'error', message: 'Expected [{ task_id, task }] or { tasks: [...] }.' }],
                nextActions: ['Ensure each task includes deterministic task_id and task fields.']
            });
            tracker.finish({ inputsSummary: `tasks-file=${tasksFile}`, artifactsRead: [tasksFile], successStatus: 'failure', warningsCount: 1 });
            return ExitCode.Failure;
        }
        const engineModule = (await import('@zachariahredfield/playbook-engine'));
        const buildWorksetPlan = engineModule.buildWorksetPlan;
        if (!buildWorksetPlan) {
            emitResult({
                format: options.format,
                quiet: options.quiet,
                command: 'orchestrate',
                ok: false,
                exitCode: ExitCode.Failure,
                summary: 'Orchestration failed: workset planner is unavailable on this build.',
                findings: [{ id: 'orchestrate.workset.unavailable', level: 'error', message: 'Missing engine export: buildWorksetPlan' }],
                nextActions: ['Rebuild workspace packages and retry.']
            });
            tracker.finish({ inputsSummary: `tasks-file=${tasksFile}`, artifactsRead: [tasksFile], successStatus: 'failure', warningsCount: 1 });
            return ExitCode.Failure;
        }
        const deriveLaneState = engineModule.deriveLaneState;
        if (!deriveLaneState) {
            emitResult({
                format: options.format,
                quiet: options.quiet,
                command: 'orchestrate',
                ok: false,
                exitCode: ExitCode.Failure,
                summary: 'Orchestration failed: lane state derivation is unavailable on this build.',
                findings: [{ id: 'orchestrate.lane-state.unavailable', level: 'error', message: 'Missing engine export: deriveLaneState' }],
                nextActions: ['Rebuild workspace packages and retry.']
            });
            tracker.finish({ inputsSummary: `tasks-file=${tasksFile}`, artifactsRead: [tasksFile], successStatus: 'failure', warningsCount: 1 });
            return ExitCode.Failure;
        }
        const worksetPlan = buildWorksetPlan(cwd, tasks, tasksFile);
        const laneState = deriveLaneState(worksetPlan, WORKSET_PLAN_PATH);
        fs.mkdirSync(path.join(cwd, '.playbook'), { recursive: true });
        fs.writeFileSync(path.join(cwd, WORKSET_PLAN_PATH), `${JSON.stringify(worksetPlan, null, 2)}\n`, 'utf8');
        fs.writeFileSync(path.join(cwd, LANE_STATE_PATH), `${JSON.stringify(laneState, null, 2)}\n`, 'utf8');
        const blockedLaneIds = new Set(laneState.blocked_lanes.map((lane) => String(lane.lane_id ?? '')).filter(Boolean));
        const readyLaneIds = new Set(laneState.ready_lanes.map((lane) => String(lane.lane_id ?? '')).filter(Boolean));
        for (const laneId of [...new Set([...blockedLaneIds, ...readyLaneIds])].sort((left, right) => left.localeCompare(right))) {
            safeRecordRepositoryEvent(() => {
                recordLaneTransition(cwd, {
                    lane_id: laneId,
                    from_state: 'planned',
                    to_state: blockedLaneIds.has(laneId) ? 'blocked' : 'ready',
                    reason: blockedLaneIds.has(laneId) ? 'missing-prerequisites' : 'dependencies-satisfied',
                    related_artifacts: [{ path: LANE_STATE_PATH, kind: 'lane_state' }]
                });
            });
        }
        emitResult({
            format: options.format,
            quiet: options.quiet,
            command: 'orchestrate',
            ok: true,
            exitCode: ExitCode.Success,
            summary: `Workset lane plan generated at ${WORKSET_PLAN_PATH}`,
            findings: [
                { id: 'orchestrate.workset.tasks', level: 'info', message: `Input tasks: ${worksetPlan.input_tasks.length}` },
                { id: 'orchestrate.workset.routed', level: 'info', message: `Routed tasks: ${worksetPlan.routed_tasks.length}` },
                { id: 'orchestrate.workset.lanes', level: 'info', message: `Parallel lanes: ${worksetPlan.lanes.length}` },
                { id: 'orchestrate.workset.blocked', level: 'warning', message: `Blocked tasks: ${worksetPlan.blocked_tasks.length}` },
                { id: 'orchestrate.workset.lane-state.blocked', level: 'warning', message: `Blocked lanes: ${laneState.blocked_lanes.length}` },
                { id: 'orchestrate.workset.lane-state.ready', level: 'info', message: `Ready lanes: ${laneState.ready_lanes.length}` },
                ...worksetPlan.warnings.map((warning, index) => ({ id: `orchestrate.workset.warning.${index + 1}`, level: 'warning', message: warning }))
            ],
            nextActions: [
                'Review lane codex_prompt fields and blocked task prerequisites before running any workers.',
                `Review ${LANE_STATE_PATH} for deterministic lane readiness before any execution handoff.`
            ]
        });
        tracker.finish({
            inputsSummary: `tasks-file=${tasksFile}`,
            artifactsRead: [tasksFile],
            artifactsWritten: [WORKSET_PLAN_PATH, LANE_STATE_PATH],
            downstreamArtifactsProduced: [WORKSET_PLAN_PATH, LANE_STATE_PATH],
            successStatus: laneState.blocked_lanes.length > 0 ? 'partial' : 'success',
            warningsCount: worksetPlan.warnings.length + laneState.blocked_lanes.length
        });
        return laneState.blocked_lanes.length > 0 ? ExitCode.Failure : ExitCode.Success;
    }
    const goal = options.goal?.trim();
    if (!goal) {
        emitResult({
            format: options.format,
            quiet: options.quiet,
            command: 'orchestrate',
            ok: false,
            exitCode: ExitCode.Failure,
            summary: 'Orchestration failed: --goal is required when --tasks-file is not provided.',
            findings: [
                {
                    id: 'orchestrate.goal.required',
                    level: 'error',
                    message: 'Missing required option: --goal <string> or --tasks-file <path>.'
                }
            ],
            nextActions: ['Run `playbook orchestrate --goal "<goal>"` or `playbook orchestrate --tasks-file <path>`.']
        });
        tracker.finish({ inputsSummary: 'goal=missing', successStatus: 'failure', warningsCount: 1 });
        return ExitCode.Failure;
    }
    const compilation = compileOrchestratorArtifacts({
        cwd,
        goal,
        laneCountRequested: options.lanes,
        outDir: options.outDir,
        artifactFormat: options.artifactFormat
    });
    const artifactIncludesJson = options.artifactFormat === 'json' || options.artifactFormat === 'both';
    emitResult({
        format: options.format,
        quiet: options.quiet,
        command: 'orchestrate',
        ok: true,
        exitCode: ExitCode.Success,
        summary: `Orchestration artifacts generated in ${compilation.relativeOutputDir}`,
        findings: [
            {
                id: 'orchestrate.goal',
                level: 'info',
                message: `Goal: ${compilation.contract.goal}`
            },
            {
                id: 'orchestrate.lanes.requested',
                level: 'info',
                message: `Lanes requested: ${compilation.contract.laneCountRequested}`
            },
            {
                id: 'orchestrate.lanes.produced',
                level: 'info',
                message: `Lanes produced: ${compilation.contract.laneCountProduced}`
            },
            {
                id: 'orchestrate.artifact-format',
                level: 'info',
                message: `Artifact format: ${options.artifactFormat}`
            },
            ...compilation.contract.warnings.map((warning, index) => ({
                id: `orchestrate.warning.${index + 1}`,
                level: 'warning',
                message: warning
            }))
        ],
        nextActions: [
            `Distribute ${compilation.artifact.workerBundleDirs.length} worker bundles from ${path.relative(cwd, path.join(compilation.outputDir, 'workers'))} to parallel Codex plan-mode workers.`,
            ...(compilation.artifact.lanePromptPaths.length > 0
                ? [`Legacy lane prompts remain available at ${compilation.relativeOutputDir} for backward compatibility.`]
                : []),
            ...(artifactIncludesJson ? [`Review ${path.relative(cwd, compilation.artifact.orchestratorPath)} lane contracts.`] : [])
        ]
    });
    tracker.finish({
        inputsSummary: `goal=${goal}`,
        artifactsWritten: [path.join(path.relative(cwd, compilation.outputDir), 'orchestrator-contract.json').replace(/\\/g, '/')],
        downstreamArtifactsProduced: [compilation.relativeOutputDir],
        successStatus: compilation.contract.warnings.length > 0 ? 'partial' : 'success',
        warningsCount: compilation.contract.warnings.length
    });
    return ExitCode.Success;
};
//# sourceMappingURL=orchestrate.js.map