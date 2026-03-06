import type { AnalyzeRule } from '../../lib/loadAnalyzeRules.js';

export const noSignalsRule: AnalyzeRule = {
  id: 'analyze-no-signals',
  description: 'Warn when no framework or database stack signals are detected.',
  check: ({ recommendation }) => recommendation.id === 'analyze-no-signals'
};
