import type { AnalyzeRule } from '../../lib/loadAnalyzeRules.js';

export const runVerifyRule: AnalyzeRule = {
  id: 'analyze-run-verify',
  description: 'Recommend running verify after analyze before opening a PR.',
  check: ({ recommendation }) => recommendation.id === 'analyze-run-verify'
};
