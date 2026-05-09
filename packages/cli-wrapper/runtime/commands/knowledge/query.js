import { knowledgeQuery } from '@zachariahredfield/playbook-engine';
import { parseKnowledgeFilters } from './shared.js';
export const runKnowledgeQuery = (cwd, args) => knowledgeQuery(cwd, parseKnowledgeFilters(args));
//# sourceMappingURL=query.js.map