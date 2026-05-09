import { createStoryRecord, generateStoryCandidates, readStoriesArtifact, STORIES_RELATIVE_PATH, STORY_CANDIDATES_RELATIVE_PATH, STORY_CONFIDENCES, STORY_PRIORITIES, STORY_SEVERITIES, STORY_STATUSES, STORY_TYPES, updateStoryStatus, upsertStory, validateStoriesArtifact, writeStoryCandidatesArtifact } from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
import { runRoute } from './route.js';
import { stageWorkflowArtifact } from '../lib/workflowPromotion.js';
const readOption = (args, name) => {
    const exact = args.findIndex((arg) => arg === name);
    if (exact >= 0)
        return args[exact + 1] ?? null;
    const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
    return prefixed ? prefixed.slice(name.length + 1) : null;
};
const hasFlag = (args, name) => args.includes(name);
const readListOption = (args, name) => args.flatMap((arg, index) => args[index - 1] === name ? [arg] : []).filter((value) => Boolean(value));
const print = (format, payload) => {
    if (format === 'json')
        console.log(JSON.stringify(payload, null, 2));
    else
        console.log(typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2));
};
const usage = 'Usage: playbook story <list|show|create|status|plan|candidates|promote> [options]';
const summarizeCandidate = (candidate) => ({
    id: candidate.id,
    title: candidate.title,
    type: candidate.type,
    priority: candidate.priority,
    severity: candidate.severity,
    confidence: candidate.confidence,
    source: candidate.source,
    evidence: candidate.evidence,
    promotion_hint: candidate.promotion_hint
});
export const runStory = async (cwd, args, options) => {
    const subcommand = args[0];
    if (!subcommand || subcommand === '--help' || subcommand === '-h') {
        print(options.format, usage);
        return subcommand ? ExitCode.Success : ExitCode.Failure;
    }
    if (subcommand === 'list') {
        const artifact = readStoriesArtifact(cwd);
        print(options.format, { schemaVersion: '1.0', command: 'story.list', repo: artifact.repo, stories: artifact.stories });
        return ExitCode.Success;
    }
    if (subcommand === 'plan') {
        const id = args[1];
        if (!id) {
            print(options.format, { schemaVersion: '1.0', command: 'story.plan', error: 'Usage: playbook story plan <id> --json' });
            return ExitCode.Failure;
        }
        return runRoute(cwd, ['--story', id], { format: options.format, quiet: options.quiet, codexPrompt: false });
    }
    if (subcommand === 'candidates') {
        const explain = hasFlag(args, '--explain');
        const artifact = generateStoryCandidates(cwd);
        const artifactPath = writeStoryCandidatesArtifact(cwd, artifact);
        print(options.format, {
            schemaVersion: '1.0',
            command: 'story.candidates',
            explain,
            artifactPath,
            repo: artifact.repo,
            readOnly: artifact.readOnly,
            sourceArtifacts: artifact.sourceArtifacts,
            candidates: explain ? artifact.candidates : artifact.candidates.map(summarizeCandidate)
        });
        return ExitCode.Success;
    }
    if (subcommand === 'promote') {
        const candidateId = args[1];
        if (!candidateId) {
            print(options.format, { schemaVersion: '1.0', command: 'story.promote', error: 'Usage: playbook story promote <candidate-id> --json' });
            return ExitCode.Failure;
        }
        const current = readStoriesArtifact(cwd);
        const errors = [];
        const candidateArtifact = generateStoryCandidates(cwd);
        const promotedCandidate = candidateArtifact.candidates.find((entry) => entry.id === candidateId) ?? null;
        if (!promotedCandidate)
            errors.push(`Story candidate not found: ${candidateId}`);
        const nextArtifact = errors.length === 0 && promotedCandidate ? upsertStory(current, { ...promotedCandidate, repo: current.repo }) : current;
        const promotion = stageWorkflowArtifact({
            cwd,
            workflowKind: 'story-promote',
            candidateRelativePath: '.playbook/stories.staged.json',
            committedRelativePath: STORIES_RELATIVE_PATH,
            artifact: nextArtifact,
            validate: () => errors.length > 0 ? errors : validateStoriesArtifact(nextArtifact),
            generatedAt: new Date().toISOString(),
            successSummary: `Promoted story candidate ${candidateId}`,
            blockedSummary: 'Story promotion blocked; committed backlog state preserved.'
        });
        print(options.format, {
            schemaVersion: '1.0',
            command: 'story.promote',
            candidate_id: candidateId,
            candidate_artifact: STORY_CANDIDATES_RELATIVE_PATH,
            story: nextArtifact.stories.find((entry) => entry.id === candidateId) ?? null,
            promotion
        });
        return promotion.promoted ? ExitCode.Success : ExitCode.PolicyFailure;
    }
    if (subcommand === 'show') {
        const id = args[1];
        if (!id) {
            print(options.format, { schemaVersion: '1.0', command: 'story.show', error: 'Missing story id.' });
            return ExitCode.Failure;
        }
        const artifact = readStoriesArtifact(cwd);
        const story = artifact.stories.find((entry) => entry.id === id);
        if (!story) {
            print(options.format, { schemaVersion: '1.0', command: 'story.show', id, error: `Story not found: ${id}` });
            return ExitCode.Failure;
        }
        print(options.format, { schemaVersion: '1.0', command: 'story.show', id, story });
        return ExitCode.Success;
    }
    if (subcommand === 'create') {
        const id = readOption(args, '--id');
        const title = readOption(args, '--title');
        const type = readOption(args, '--type');
        const source = readOption(args, '--source');
        const severity = readOption(args, '--severity');
        const priority = readOption(args, '--priority');
        const confidence = readOption(args, '--confidence');
        const rationale = readOption(args, '--rationale') ?? '';
        const lane = readOption(args, '--execution-lane');
        const route = readOption(args, '--suggested-route');
        const evidence = readListOption(args, '--evidence');
        const acceptance = readListOption(args, '--acceptance');
        const dependencies = readListOption(args, '--depends-on');
        const errors = [];
        if (!id)
            errors.push('Missing required option --id');
        if (!title)
            errors.push('Missing required option --title');
        if (!type)
            errors.push('Missing required option --type');
        if (!source)
            errors.push('Missing required option --source');
        if (!severity)
            errors.push('Missing required option --severity');
        if (!priority)
            errors.push('Missing required option --priority');
        if (!confidence)
            errors.push('Missing required option --confidence');
        if (type && !STORY_TYPES.includes(type))
            errors.push(`Invalid --type value "${type}"`);
        if (severity && !STORY_SEVERITIES.includes(severity))
            errors.push(`Invalid --severity value "${severity}"`);
        if (priority && !STORY_PRIORITIES.includes(priority))
            errors.push(`Invalid --priority value "${priority}"`);
        if (confidence && !STORY_CONFIDENCES.includes(confidence))
            errors.push(`Invalid --confidence value "${confidence}"`);
        const current = readStoriesArtifact(cwd);
        const nextStory = errors.length === 0 ? createStoryRecord(current.repo, {
            id: id, title: title, type: type, source: source, severity: severity, priority: priority, confidence: confidence,
            rationale, evidence, acceptance_criteria: acceptance, dependencies, execution_lane: lane, suggested_route: route
        }) : null;
        if (nextStory && current.stories.some((story) => story.id === nextStory.id))
            errors.push(`Story already exists: ${nextStory.id}`);
        const nextArtifact = nextStory ? upsertStory(current, nextStory) : current;
        const promotion = stageWorkflowArtifact({
            cwd,
            workflowKind: 'story-create',
            candidateRelativePath: '.playbook/stories.staged.json',
            committedRelativePath: STORIES_RELATIVE_PATH,
            artifact: nextArtifact,
            validate: () => errors.length > 0 ? errors : validateStoriesArtifact(nextArtifact),
            generatedAt: new Date().toISOString(),
            successSummary: `Created story ${id}`,
            blockedSummary: 'Story creation blocked; committed backlog state preserved.'
        });
        print(options.format, { schemaVersion: '1.0', command: 'story.create', story: nextStory, promotion });
        return promotion.promoted ? ExitCode.Success : ExitCode.PolicyFailure;
    }
    if (subcommand === 'status') {
        const id = args[1];
        const status = readOption(args, '--status');
        if (!id || !status) {
            print(options.format, { schemaVersion: '1.0', command: 'story.status', error: 'Usage: playbook story status <id> --status <status>' });
            return ExitCode.Failure;
        }
        const current = readStoriesArtifact(cwd);
        const story = current.stories.find((entry) => entry.id === id);
        const errors = [];
        if (!story)
            errors.push(`Story not found: ${id}`);
        if (!STORY_STATUSES.includes(status))
            errors.push(`Invalid --status value "${status}"`);
        const nextArtifact = errors.length === 0 ? updateStoryStatus(current, id, status) : current;
        const promotion = stageWorkflowArtifact({
            cwd,
            workflowKind: 'story-status',
            candidateRelativePath: '.playbook/stories.staged.json',
            committedRelativePath: STORIES_RELATIVE_PATH,
            artifact: nextArtifact,
            validate: () => errors.length > 0 ? errors : validateStoriesArtifact(nextArtifact),
            generatedAt: new Date().toISOString(),
            successSummary: `Updated story ${id} to status ${status}`,
            blockedSummary: 'Story status update blocked; committed backlog state preserved.'
        });
        print(options.format, { schemaVersion: '1.0', command: 'story.status', id, status, story: nextArtifact.stories.find((entry) => entry.id === id) ?? null, promotion });
        return promotion.promoted ? ExitCode.Success : ExitCode.PolicyFailure;
    }
    print(options.format, { schemaVersion: '1.0', command: 'story', error: `Unsupported subcommand: ${subcommand}`, usage });
    return ExitCode.Failure;
};
//# sourceMappingURL=story.js.map