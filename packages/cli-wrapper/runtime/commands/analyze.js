import { analyze, formatAnalyzeCi, formatAnalyzeHuman } from '@zachariahredfield/playbook-core';
import { generateRepositoryIndex } from '@zachariahredfield/playbook-engine';
import { createNodeContext } from '@zachariahredfield/playbook-node';
import fs from 'node:fs';
import path from 'node:path';
import { emitResult, ExitCode } from '../lib/cliContract.js';
import { loadAnalyzeRules } from '../lib/loadAnalyzeRules.js';
const repoIndexPathForRoot = (repoRoot) => path.join(repoRoot, '.playbook', 'repo-index.json');
const writeRepoIndex = async (repoRoot) => {
    const outPath = repoIndexPathForRoot(repoRoot);
    const payload = generateRepositoryIndex(repoRoot);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return outPath;
};
export const ensureRepoIndex = async (repoRoot) => {
    const outPath = repoIndexPathForRoot(repoRoot);
    if (fs.existsSync(outPath)) {
        return outPath;
    }
    return await writeRepoIndex(repoRoot);
};
const resolveRecommendationGuidance = (analyzeRules, recommendation) => {
    const rule = analyzeRules.find((candidate) => candidate.check({ recommendation }));
    return {
        explanation: rule?.explanation ?? recommendation.why,
        remediation: rule?.remediation ?? [recommendation.fix]
    };
};
export const collectAnalyzeReport = async (cwd) => analyze(await createNodeContext({ cwd }));
export const runAnalyze = async (cwd, opts) => {
    const ctx = await createNodeContext({ cwd });
    const result = await analyze(ctx);
    const analyzeRules = await loadAnalyzeRules();
    const repoIndexPath = await writeRepoIndex(ctx.repoRoot);
    if (opts.format === 'text' && !opts.ci) {
        if (!opts.explain) {
            console.log(formatAnalyzeHuman(result));
            console.log(`\nRepository index written: ${path.relative(cwd, repoIndexPath)}`);
            return ExitCode.Success;
        }
    }
    if (opts.format === 'text' && opts.ci && !opts.explain) {
        if (!opts.quiet || !result.ok) {
            console.log(formatAnalyzeCi(result));
            if (!opts.quiet) {
                console.log(`Repository index written: ${path.relative(cwd, repoIndexPath)}`);
            }
        }
        return result.ok ? ExitCode.Success : ExitCode.Failure;
    }
    emitResult({
        format: opts.format,
        quiet: opts.quiet,
        explain: opts.explain,
        command: 'analyze',
        ok: result.ok,
        exitCode: result.ok ? ExitCode.Success : ExitCode.Failure,
        summary: result.ok ? 'Analyze completed successfully.' : 'Analyze completed with findings.',
        findings: result.recommendations.map((rec) => ({
            ...resolveRecommendationGuidance(analyzeRules, rec),
            id: `analyze.recommendation.${rec.id}`,
            level: rec.severity === 'WARN' ? 'warning' : 'info',
            message: rec.message
        })),
        nextActions: [...result.recommendations.map((rec) => rec.fix), `Review ${path.relative(cwd, repoIndexPath)} for architecture index consumers.`]
    });
    return result.ok ? ExitCode.Success : ExitCode.Failure;
};
//# sourceMappingURL=analyze.js.map