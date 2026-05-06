import { knowledgeInspect } from '@zachariahredfield/playbook-engine';
import { parseIntegerOption, readOptionValue, resolveSubcommandArgument } from './shared.js';
export const runKnowledgeInspect = (cwd, args) => {
    const id = resolveSubcommandArgument(args);
    if (!id) {
        throw new Error('playbook knowledge inspect: missing required <id> argument');
    }
    return knowledgeInspect(cwd, id, {
        staleDays: parseIntegerOption(readOptionValue(args, '--days'), '--days')
    });
};
//# sourceMappingURL=inspect.js.map