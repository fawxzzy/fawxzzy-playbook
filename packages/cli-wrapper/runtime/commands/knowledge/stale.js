import { knowledgeStale } from '@zachariahredfield/playbook-engine';
import { parseIntegerOption, parseOrderOption, readOptionValue } from './shared.js';
export const runKnowledgeStale = (cwd, args) => knowledgeStale(cwd, {
    limit: parseIntegerOption(readOptionValue(args, '--limit'), '--limit'),
    order: parseOrderOption(readOptionValue(args, '--order')),
    staleDays: parseIntegerOption(readOptionValue(args, '--days'), '--days')
});
//# sourceMappingURL=stale.js.map