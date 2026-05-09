import { answerRepositoryQuestion } from '@zachariahredfield/playbook-engine';
import { loadAskRepoContext } from '../ai/repoContext.js';
import { getResponseModeInstruction, parseResponseMode } from '../ai/responseModes.js';
import { ExitCode } from '../lib/cliContract.js';
const REPO_INDEX_PATH = '.playbook/repo-index.json';
const AI_CONTRACT_PATH = '.playbook/ai-contract.json';
const MODULE_DIGESTS_PATH = '.playbook/module-digests.json';
const toUniqueSortedStrings = (values) => {
    if (!Array.isArray(values)) {
        return [];
    }
    const unique = new Set();
    for (const value of values) {
        if (typeof value === 'string' && value.length > 0) {
            unique.add(value);
        }
    }
    return Array.from(unique).sort((left, right) => left.localeCompare(right));
};
const appendMemorySources = (context, sources) => {
    const nextSources = [...sources];
    if (Array.isArray(context.memoryKnowledge)) {
        nextSources.push({ type: 'memory-knowledge', path: '.playbook/memory/knowledge/*' });
        const seen = new Set();
        const knowledge = context.memoryKnowledge;
        for (const hit of knowledge) {
            if (!Array.isArray(hit.provenance)) {
                continue;
            }
            for (const provenanceEntry of hit.provenance) {
                if (!provenanceEntry || typeof provenanceEntry !== 'object' || Array.isArray(provenanceEntry)) {
                    continue;
                }
                const sourcePath = provenanceEntry.sourcePath;
                if (typeof sourcePath !== 'string' || sourcePath.length === 0) {
                    continue;
                }
                const memoryPath = sourcePath.startsWith('.playbook/memory/') ? sourcePath : `.playbook/memory/${sourcePath.replace(/^\/+/, '')}`;
                if (seen.has(memoryPath)) {
                    continue;
                }
                seen.add(memoryPath);
                nextSources.push({ type: 'memory-event', path: memoryPath });
            }
        }
    }
    return nextSources;
};
const buildContextSources = (context, repoContextSources, moduleName) => {
    const sources = [
        { type: 'repo-index', path: REPO_INDEX_PATH },
        { type: 'repo-graph', path: '.playbook/repo-graph.json' },
        { type: 'architecture-metadata', path: REPO_INDEX_PATH },
        { type: 'rule-registry', path: REPO_INDEX_PATH }
    ];
    if (repoContextSources.includes(AI_CONTRACT_PATH) || repoContextSources.includes('generated-ai-contract-fallback')) {
        sources.push({
            type: 'ai-contract',
            path: repoContextSources.includes(AI_CONTRACT_PATH) ? AI_CONTRACT_PATH : 'generated-ai-contract-fallback'
        });
    }
    if (repoContextSources.includes(MODULE_DIGESTS_PATH)) {
        sources.push({ type: 'module-digest', path: MODULE_DIGESTS_PATH });
    }
    if (typeof moduleName === 'string' && moduleName.length > 0) {
        sources.push({ type: 'module', name: moduleName });
    }
    if (context.moduleDigest && typeof context.moduleDigest === 'object') {
        const digestName = context.moduleDigest.id;
        const moduleDigestName = typeof digestName === 'string' ? digestName : moduleName;
        if (typeof moduleDigestName === 'string' && moduleDigestName.length > 0) {
            sources.push({ type: 'module-digest', path: '.playbook/module-digests.json' });
        }
    }
    if (context.diff && typeof context.diff === 'object' && !Array.isArray(context.diff)) {
        const diffRecord = context.diff;
        const changedFiles = toUniqueSortedStrings(diffRecord.changedFiles);
        sources.push({ type: 'diff', files: changedFiles });
        const docs = toUniqueSortedStrings(diffRecord.docs);
        for (const docsPath of docs) {
            sources.push({ type: 'docs', path: docsPath });
        }
    }
    return appendMemorySources(context, sources);
};
const parseAskInput = (args) => {
    const tokens = [];
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--help' || arg === '-h') {
            return { help: true };
        }
        if (arg === '--mode' || arg === '--module' || arg === '--base') {
            index += 1;
            continue;
        }
        if (arg.startsWith('-')) {
            continue;
        }
        tokens.push(arg);
    }
    if (tokens.length === 0) {
        return { help: false };
    }
    return {
        help: false,
        question: tokens.join(' ')
    };
};
const formatAnswerForMode = (answer, reason, mode) => {
    if (mode === 'normal') {
        return answer;
    }
    if (mode === 'concise') {
        return `${answer} (${reason})`;
    }
    return [`- ${answer}`, `- Why: ${reason}`].join('\n');
};
const showAskHelp = () => {
    console.log(`Usage: playbook ask <question> [options]

Answer repository questions from machine-readable intelligence context.

Options:
  --mode <mode>              Controls response verbosity
                             normal   Full explanation (default)
                             concise  Compressed but informative
                             ultra    Maximum compression
  --repo-context             Inject trusted repository intelligence into ask context
                             using Playbook-managed artifacts (for example
                             .playbook/repo-index.json and .playbook/ai-contract.json)
  --module <name>            Scope ask reasoning to indexed module intelligence from
                             .playbook/repo-index.json
  --diff-context             Scope ask reasoning to changed files mapped through
                             .playbook/repo-index.json (requires git diff + index)
  --base <ref>               Optional git base ref used with --diff-context
  --with-repo-context-memory Opt in to memory-aware hydration for --repo-context prompts
  --with-diff-context-memory Opt in to memory-aware hydration for --diff-context prompts
  --help                     Show help`);
};
export const runAsk = async (cwd, commandArgs, options) => {
    const parsedInput = parseAskInput(commandArgs);
    if (parsedInput.help) {
        showAskHelp();
        return ExitCode.Success;
    }
    const questionArg = parsedInput.question;
    if (!questionArg) {
        console.error('playbook ask: missing required <question> argument');
        return ExitCode.Failure;
    }
    try {
        if (options.module && options.diffContext) {
            throw new Error('playbook ask: --module and --diff-context cannot be used together. Choose one deterministic scope.');
        }
        const mode = parseResponseMode(options.mode);
        const repoContext = loadAskRepoContext({ cwd, enabled: options.repoContext ?? false });
        const moduleContextPrefix = options.module ? `Scoped module context: ${options.module}` : '';
        const diffContextPrefix = options.diffContext
            ? `Diff context enabled${options.base ? ` (base: ${options.base})` : ''}`
            : '';
        const scopesPrefix = [moduleContextPrefix, diffContextPrefix].filter((value) => value.length > 0).join('\n');
        const enrichedQuestion = repoContext.enabled
            ? `${scopesPrefix}${scopesPrefix.length > 0 ? '\n' : ''}${repoContext.promptContext}\n\nUser question: ${questionArg}`
            : questionArg;
        const answer = answerRepositoryQuestion(cwd, enrichedQuestion, {
            module: options.module,
            diffContext: options.diffContext,
            baseRef: options.base,
            withRepoContextMemory: options.withRepoContextMemory ?? false,
            withDiffContextMemory: options.withDiffContextMemory ?? false
        });
        const modeInstruction = getResponseModeInstruction(mode);
        const answerForMode = formatAnswerForMode(answer.answer, answer.reason, mode);
        const resultContext = {
            ...answer.context,
            sources: buildContextSources(answer.context, repoContext.sources, options.module)
        };
        const result = {
            answerability: answer.answerability,
            command: 'ask',
            question: answer.question,
            mode,
            modeInstruction,
            answer: answerForMode,
            reason: answer.reason,
            repoContext: {
                enabled: repoContext.enabled,
                sources: repoContext.sources,
                cacheLifecycle: repoContext.cacheLifecycle
            },
            scope: {
                module: options.module,
                diffContext: {
                    enabled: options.diffContext ?? false,
                    baseRef: options.base
                }
            },
            context: resultContext
        };
        if (options.format === 'json') {
            console.log(JSON.stringify(result, null, 2));
            return ExitCode.Success;
        }
        if (!options.quiet) {
            console.log(result.answer);
            if (mode === 'normal') {
                console.log('');
                console.log('Reason');
                console.log(result.reason);
            }
        }
        return ExitCode.Success;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.format === 'json') {
            console.log(JSON.stringify({
                command: 'ask',
                question: questionArg,
                error: message
            }, null, 2));
        }
        else {
            console.error(message);
        }
        return ExitCode.Failure;
    }
};
//# sourceMappingURL=ask.js.map