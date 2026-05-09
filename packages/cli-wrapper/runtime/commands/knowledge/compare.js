import { knowledgeCompareQuery } from '@zachariahredfield/playbook-engine';
import { parseIntegerOption, readOptionValue } from './shared.js';
export const runKnowledgeCompare = (cwd, args) => {
    const positional = args.filter((arg) => !arg.startsWith('-'));
    const leftId = positional[1];
    const rightId = positional[2];
    if (!leftId || !rightId) {
        throw new Error('playbook knowledge compare: missing required <left-id> and <right-id> arguments');
    }
    return knowledgeCompareQuery(cwd, leftId, rightId, {
        staleDays: parseIntegerOption(readOptionValue(args, '--days'), '--days')
    });
};
//# sourceMappingURL=compare.js.map