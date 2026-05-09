import fs from 'node:fs';
import path from 'node:path';
import { ExitCode } from '../lib/cliContract.js';
import { runContext } from './context.js';
import { runIndex } from './repoIndex.js';
import { runPlan } from './plan.js';
import { runQuery } from './query.js';
import { runVerify } from './verify.js';
const PILOT_PHASES = ['context', 'index', 'query modules', 'verify', 'plan'];
const parseJsonOutput = (entries, phase) => {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        try {
            return JSON.parse(entries[index]);
        }
        catch {
            // Keep scanning captured lines until a valid JSON payload is found.
        }
    }
    throw new Error(`playbook pilot: ${phase} produced no JSON payload`);
};
const captureJsonPhase = async (runPhase, phase) => {
    const originalLog = console.log;
    const captured = [];
    console.log = (...args) => {
        const line = args
            .map((value) => {
            if (typeof value === 'string') {
                return value;
            }
            try {
                return JSON.stringify(value);
            }
            catch {
                return String(value);
            }
        })
            .join(' ');
        captured.push(line);
    };
    try {
        const exitCode = await runPhase();
        const payload = parseJsonOutput(captured, phase);
        return { exitCode, payload };
    }
    finally {
        console.log = originalLog;
    }
};
const assertJsonFile = (targetPath) => {
    try {
        JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`playbook pilot: invalid JSON artifact at ${targetPath}: ${message}`);
    }
};
const toPosixRelative = (cwd, targetPath) => path.relative(cwd, targetPath).split(path.sep).join(path.posix.sep);
const writePilotSummaryArtifact = (targetPath, summary) => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
};
const printSummaryText = (summary) => {
    console.log('Playbook Pilot');
    console.log(`Target repo: ${summary.targetRepoPath}`);
    console.log(`Framework: ${summary.frameworkInference}`);
    console.log(`Architecture: ${summary.architectureInference}`);
    console.log(`Modules: ${summary.modulesDetectedCount}`);
    console.log(`Verify failures: ${summary.verifyFailuresCount}`);
    console.log(`Verify warnings: ${summary.verifyWarningsCount}`);
    console.log(`Remediation: ${summary.remediationStatus}`);
    console.log('Artifacts');
    for (const artifactPath of summary.artifactPathsWritten) {
        console.log(`- ${artifactPath}`);
    }
};
const buildSummary = (input) => {
    const verifyFailuresCount = input.verify.findings.filter((entry) => entry.level === 'error').length;
    const verifyWarningsCount = input.verify.findings.filter((entry) => entry.level === 'warning').length;
    return {
        schemaVersion: '1.0',
        command: 'pilot',
        ok: true,
        targetRepoPath: input.cwd,
        frameworkInference: input.index.framework,
        architectureInference: input.index.architecture,
        modulesDetectedCount: input.queryModules.result.length,
        verifyWarningsCount,
        verifyFailuresCount,
        remediationStatus: input.plan.remediation?.status ?? 'unknown',
        artifactPathsWritten: input.artifacts
    };
};
export const runPilot = async (cwd, options) => {
    if (options.repo !== undefined && options.repo.trim().length === 0) {
        console.error('playbook pilot: --repo requires a non-empty path value');
        return { exitCode: ExitCode.Failure, childCommands: [] };
    }
    const playbookDir = path.join(cwd, '.playbook');
    fs.mkdirSync(playbookDir, { recursive: true });
    const findingsPath = path.join(playbookDir, 'findings.json');
    const planPath = path.join(playbookDir, 'plan.json');
    const indexPath = path.join(playbookDir, 'repo-index.json');
    const graphPath = path.join(playbookDir, 'repo-graph.json');
    const summaryPath = path.join(playbookDir, 'pilot-summary.json');
    const contextPhase = await captureJsonPhase(() => runContext(cwd, {
        format: 'json',
        quiet: true
    }), 'context');
    if (contextPhase.exitCode !== ExitCode.Success) {
        return { exitCode: ExitCode.Failure, childCommands: [...PILOT_PHASES] };
    }
    const indexPhase = await captureJsonPhase(() => runIndex(cwd, {
        format: 'json',
        quiet: true
    }), 'index');
    if (indexPhase.exitCode !== ExitCode.Success) {
        return { exitCode: ExitCode.Failure, childCommands: [...PILOT_PHASES] };
    }
    const queryModulesPhase = await captureJsonPhase(() => runQuery(cwd, ['modules'], {
        format: 'json',
        quiet: true
    }), 'query modules');
    if (queryModulesPhase.exitCode !== ExitCode.Success) {
        return { exitCode: ExitCode.Failure, childCommands: [...PILOT_PHASES] };
    }
    const verifyPhase = await captureJsonPhase(() => runVerify(cwd, {
        format: 'json',
        ci: true,
        quiet: true,
        explain: false,
        policy: false,
        outFile: findingsPath
    }), 'verify');
    if (verifyPhase.exitCode !== ExitCode.Success && verifyPhase.exitCode !== ExitCode.PolicyFailure) {
        return { exitCode: ExitCode.Failure, childCommands: [...PILOT_PHASES] };
    }
    const planPhase = await captureJsonPhase(() => runPlan(cwd, {
        format: 'json',
        ci: true,
        quiet: true,
        outFile: planPath
    }), 'plan');
    if (planPhase.exitCode !== ExitCode.Success) {
        return { exitCode: ExitCode.Failure, childCommands: [...PILOT_PHASES] };
    }
    assertJsonFile(findingsPath);
    assertJsonFile(planPath);
    assertJsonFile(indexPath);
    assertJsonFile(graphPath);
    const summary = buildSummary({
        cwd,
        index: indexPhase.payload,
        queryModules: queryModulesPhase.payload,
        verify: verifyPhase.payload,
        plan: planPhase.payload,
        artifacts: [
            toPosixRelative(cwd, indexPath),
            toPosixRelative(cwd, graphPath),
            toPosixRelative(cwd, findingsPath),
            toPosixRelative(cwd, planPath),
            toPosixRelative(cwd, summaryPath)
        ]
    });
    writePilotSummaryArtifact(summaryPath, summary);
    if (options.format === 'json') {
        console.log(JSON.stringify(summary, null, 2));
    }
    else if (!options.quiet) {
        printSummaryText(summary);
    }
    return { exitCode: ExitCode.Success, childCommands: [...PILOT_PHASES] };
};
//# sourceMappingURL=pilot.js.map