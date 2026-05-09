import { knowledgeList } from '@zachariahredfield/playbook-engine';
import { parseKnowledgeFilters } from './shared.js';
export const runKnowledgeList = (cwd, args) => knowledgeList(cwd, parseKnowledgeFilters(args));
//# sourceMappingURL=list.js.map