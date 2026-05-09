import { knowledgeTimeline } from '@zachariahredfield/playbook-engine';
import { parseKnowledgeFilters } from './shared.js';
export const runKnowledgeTimeline = (cwd, args) => knowledgeTimeline(cwd, parseKnowledgeFilters(args));
//# sourceMappingURL=timeline.js.map