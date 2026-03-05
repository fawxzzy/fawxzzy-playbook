import { analyze, formatAnalyzeCi, formatAnalyzeHuman, formatAnalyzeJson } from '@zachariahredfield/playbook-core';
import { createNodeContext } from '@zachariahredfield/playbook-node';

type AnalyzeOptions = {
  ci: boolean;
  json: boolean;
};

export const runAnalyze = (cwd: string, opts: AnalyzeOptions): number => {
  const result = analyze(createNodeContext({ cwd }));

  if (opts.json) {
    console.log(formatAnalyzeJson(result));
    return 0;
  }

  if (opts.ci) {
    console.log(formatAnalyzeCi(result));
    return result.ok ? 0 : 1;
  }

  console.log(formatAnalyzeHuman(result));
  return 0;
};
