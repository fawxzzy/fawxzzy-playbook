import type { AnalyzeRule } from '../../lib/loadAnalyzeRules.js';

export const runInitRule: AnalyzeRule = {
  id: 'analyze-run-init',
  description: 'Recommend initializing governance docs for repositories missing a baseline.',
  check: ({ recommendation }) => recommendation.id === 'analyze-run-init'
};
