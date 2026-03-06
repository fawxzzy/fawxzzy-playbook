import { analyze, formatAnalyzeCi, formatAnalyzeHuman } from '@zachariahredfield/playbook-core';
import { createNodeContext } from '@zachariahredfield/playbook-node';
import { emitResult, ExitCode } from '../lib/cliContract.js';
import { loadAnalyzeRules } from '../lib/loadAnalyzeRules.js';

export type AnalyzeReport = Awaited<ReturnType<typeof analyze>>;
type AnalyzeRecommendation = AnalyzeReport['recommendations'][number];

type AnalyzeOptions = {
  ci: boolean;
  explain: boolean;
  format: 'text' | 'json';
  quiet: boolean;
};

const analyzeRules = loadAnalyzeRules();

const resolveRecommendationGuidance = (recommendation: AnalyzeRecommendation): { explanation?: string; remediation?: string[] } => {
  const rule = analyzeRules.find((candidate) => candidate.check({ recommendation }));
  return {
    explanation: rule?.explanation ?? recommendation.why,
    remediation: rule?.remediation ?? [recommendation.fix]
  };
};

export const collectAnalyzeReport = async (cwd: string): Promise<AnalyzeReport> => analyze(createNodeContext({ cwd }));

export const runAnalyze = async (cwd: string, opts: AnalyzeOptions): Promise<number> => {
  const result = await collectAnalyzeReport(cwd);

  if (opts.format === 'text' && !opts.ci) {
    if (!opts.explain) {
      console.log(formatAnalyzeHuman(result));
      return ExitCode.Success;
    }
  }

  if (opts.format === 'text' && opts.ci && !opts.explain) {
    if (!opts.quiet || !result.ok) {
      console.log(formatAnalyzeCi(result));
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
    findings: result.recommendations.map((rec: AnalyzeRecommendation) => ({
      ...resolveRecommendationGuidance(rec),
      id: `analyze.recommendation.${rec.id}`,
      level: rec.severity === 'WARN' ? 'warning' as const : 'info' as const,
      message: rec.message
    })),
    nextActions: result.recommendations.map((rec: AnalyzeRecommendation) => rec.fix)
  });

  return result.ok ? ExitCode.Success : ExitCode.Failure;
};
