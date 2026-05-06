import { noSignalsRule } from '../rules/analyze/noSignalsRule.js';
import { runInitRule } from '../rules/analyze/runInitRule.js';
import { runVerifyRule } from '../rules/analyze/runVerifyRule.js';
export const coreAnalyzeRules = [noSignalsRule, runInitRule, runVerifyRule];
export const loadAnalyzeRules = async () => coreAnalyzeRules;
//# sourceMappingURL=loadAnalyzeRules.js.map