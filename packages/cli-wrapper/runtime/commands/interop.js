import path from 'node:path';
import fs from 'node:fs';
import * as engineRuntime from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
import { emitJsonOutput } from '../lib/jsonArtifact.js';
import { printCommandHelp } from '../lib/commandSurface.js';
const toAutomationTemplateType = (followupType) => {
    if (followupType === 'memory-candidate')
        return 'knowledge-memory-candidate';
    if (followupType === 'next-plan-hint')
        return 'plan-hint-template';
    if (followupType === 'review-cue')
        return 'review-cue-template';
    return 'docs-story-followup-template';
};
const extractPromotedKnowledgeRefs = (refs) => [...new Set((refs ?? []).filter((ref) => ref.includes('knowledge:') || ref.includes('promoted') || ref.includes('.playbook/memory/knowledge/')))].sort((left, right) => left.localeCompare(right));
const toAutomationSynthesisSuggestions = (followups) => followups
    .map((followup) => {
    const templateType = toAutomationTemplateType(followup.followupType);
    return {
        suggestionId: followup.followupId,
        templateType,
        sourcePromotedKnowledgeRefs: extractPromotedKnowledgeRefs(followup.provenanceRefs),
        confidence: typeof followup.confidence?.score === 'number' ? followup.confidence.score : null,
        rationale: typeof followup.confidence?.rationale === 'string' && followup.confidence.rationale.length > 0 ? followup.confidence.rationale : null,
        nextAction: followup.nextActionText
    };
})
    .sort((left, right) => left.suggestionId.localeCompare(right.suggestionId));
const fitnessIntegrationContract = engineRuntime.fitnessIntegrationContract;
const actionKinds = fitnessIntegrationContract.actions.map((entry) => entry.name);
const defaultBoundedActionInputByAction = {
    adjust_upcoming_workout_load: {
        athlete_id: 'athlete-001',
        week_id: 'week-2026-W13',
        workout_id: 'workout-001',
        load_adjustment_percent: -10,
        duration_days: 3,
        reason_code: 'fatigue_spike'
    },
    schedule_recovery_block: {
        athlete_id: 'athlete-001',
        week_id: 'week-2026-W13',
        start_date: '2026-03-30',
        duration_days: 3,
        recovery_mode: 'rest'
    },
    revise_weekly_goal_plan: {
        athlete_id: 'athlete-001',
        week_id: 'week-2026-W13',
        goal_domain: 'consistency',
        target_value: 4,
        duration_days: 7
    }
};
const engine = engineRuntime;
const interopFollowupTypes = new Set(['memory-candidate', 'next-plan-hint', 'review-cue', 'docs-story-followup']);
const interopFollowupSurfaces = new Set([
    '.playbook/memory/candidates.json',
    '.playbook/plan.json',
    '.playbook/review-queue.json',
    '.playbook/stories.json'
]);
const parseInteropFollowupTypeFilter = (raw) => {
    if (!raw)
        return undefined;
    if (!interopFollowupTypes.has(raw)) {
        throw new Error(`playbook interop followups: invalid --type value "${raw}"; expected memory-candidate, next-plan-hint, review-cue, or docs-story-followup`);
    }
    return raw;
};
const parseInteropFollowupSurfaceFilter = (raw) => {
    if (!raw)
        return undefined;
    if (!interopFollowupSurfaces.has(raw)) {
        throw new Error(`playbook interop followups: invalid --surface value "${raw}"; expected .playbook/memory/candidates.json, .playbook/plan.json, .playbook/review-queue.json, or .playbook/stories.json`);
    }
    return raw;
};
const readRendezvous = (cwd) => {
    const manifestPath = path.resolve(cwd, '.playbook/rendezvous-manifest.json');
    const statusPath = path.resolve(cwd, '.playbook/rendezvous-status.json');
    const manifest = engine.readArtifactJson(manifestPath);
    const status = fs.existsSync(statusPath)
        ? engine.readArtifactJson(statusPath).evaluation
        : { state: 'complete', releaseReady: true, blockers: [], missingArtifactIds: [], conflictingArtifactIds: [], stale: false };
    return { manifest, evaluation: status };
};
const readPlanDerivedReadiness = (cwd, approvedPlan) => {
    const manifestPath = path.resolve(cwd, '.playbook/rendezvous-manifest.json');
    if (fs.existsSync(manifestPath)) {
        const { manifest, evaluation } = readRendezvous(cwd);
        return { source: 'rendezvous', manifest, evaluation };
    }
    const planPath = path.resolve(cwd, '.playbook/plan.json');
    if (!fs.existsSync(planPath)) {
        throw new Error('Cannot emit plan-derived Fitness request: missing .playbook/rendezvous-manifest.json or .playbook/plan.json.');
    }
    const plan = engine.readArtifactJson(planPath);
    return {
        source: 'approved-plan',
        plan: { command: String(plan.command ?? '') },
        approved: approvedPlan,
        remediation_id: `plan-${path.basename(cwd)}-fitness`,
        required_artifact_ids: ['plan']
    };
};
const toFitnessContractInspectPayload = async (cwd) => {
    const artifact = await engine.materializeFitnessContractArtifact({ repoRoot: cwd });
    return {
        sourceRepo: artifact.source.sourceRepo,
        sourceRef: artifact.source.sourceRef,
        sourcePath: artifact.source.sourcePath,
        syncMode: artifact.source.syncMode,
        sourceHash: artifact.fingerprint,
        canonicalPayloadSummary: {
            appIdentity: {
                kind: artifact.payload.kind,
                schemaVersion: artifact.payload.schemaVersion
            },
            signalNames: [...artifact.payload.signalTypes],
            stateSnapshotTypes: [...artifact.payload.stateSnapshotTypes],
            boundedActionNames: artifact.payload.actions.map((entry) => entry.name),
            receiptTypes: [...artifact.payload.receiptTypes]
        },
        contract: artifact.payload
    };
};
export const runInterop = async (cwd, commandArgs, options) => {
    if (options.help) {
        printCommandHelp({
            usage: 'playbook interop <register|emit|emit-fitness-plan|draft|run-mock|reconcile|capabilities|requests|receipts|health|fitness-contract|followups> [--json]',
            description: 'Inspect and operate remediation-first Playbook↔Lifeline interop runtime artifacts.',
            options: [
                '--capability <id>   capability id for register/emit',
                '--action <kind>     remediation action kind',
                '--action-input-json <json>  bounded action input payload (Fitness contract-shaped)',
                '--approved-plan     require explicit approval when deriving from .playbook/plan.json',
                '--runtime <id>      runtime id (default lifeline-mock-runtime)',
                '--from-proposal <path>  proposal artifact path for draft compile (default .playbook/ai-proposal.json)',
                '--from-draft <path>  emit from canonical .playbook/interop-request-draft.json after explicit review',
                '--type <followup-type>  filter followups by type (followups subcommand only)',
                '--surface <target-surface>  filter followups by target surface (followups subcommand only)',
                '--json              emit machine-readable output',
                '--help              show help'
            ],
            artifacts: [
                '.playbook/lifeline-interop-runtime.json',
                '.playbook/rendezvous-manifest.json',
                '.playbook/interop-request-draft.json',
                '.playbook/interop-followups.json'
            ]
        });
        return ExitCode.Success;
    }
    const sub = commandArgs[0] ?? 'health';
    const valueFor = (name) => {
        const index = commandArgs.indexOf(name);
        return index >= 0 ? commandArgs[index + 1] : undefined;
    };
    try {
        const runtimeId = valueFor('--runtime') ?? 'lifeline-mock-runtime';
        const actionInputJson = valueFor('--action-input-json');
        const fromDraft = valueFor('--from-draft');
        if (sub === 'followups') {
            const typeFilter = parseInteropFollowupTypeFilter(valueFor('--type'));
            const surfaceFilter = parseInteropFollowupSurfaceFilter(valueFor('--surface'));
            const followupsPath = path.resolve(cwd, '.playbook/interop-followups.json');
            if (!fs.existsSync(followupsPath)) {
                throw new Error('playbook interop followups: missing required artifact .playbook/interop-followups.json');
            }
            const fullFollowupsArtifact = engine.readArtifactJson(followupsPath);
            const followups = fullFollowupsArtifact.followups.filter((followup) => {
                if (typeFilter && followup.followupType !== typeFilter) {
                    return false;
                }
                if (surfaceFilter && followup.targetSurface !== surfaceFilter) {
                    return false;
                }
                return true;
            });
            const automationSynthesisSuggestions = toAutomationSynthesisSuggestions(followups);
            const payload = {
                schemaVersion: '1.0',
                command: 'interop-followups',
                artifactPath: '.playbook/interop-followups.json',
                reviewOnly: true,
                authority: 'read-only',
                proposalOnly: true,
                filters: {
                    ...(typeFilter ? { type: typeFilter } : {}),
                    ...(surfaceFilter ? { surface: surfaceFilter } : {})
                },
                summary: {
                    total: fullFollowupsArtifact.followups.length,
                    returned: followups.length
                },
                automationSynthesis: {
                    suggestionCount: automationSynthesisSuggestions.length
                },
                automationSynthesisSuggestions,
                followups,
                full_followups_artifact: fullFollowupsArtifact
            };
            if (options.format === 'json') {
                emitJsonOutput({ cwd, command: 'interop', payload: { command: 'interop', subcommand: sub, payload } });
            }
            else if (!options.quiet) {
                if (followups.length === 0) {
                    console.log('Status: no interop followups queued.');
                    console.log('Affected targets: none');
                    console.log('Next action: continue using existing read-only interop inspect surfaces.');
                }
                else {
                    const affectedTargets = [...new Set(followups.map((followup) => followup.targetSurface))]
                        .slice(0, 3)
                        .join(', ');
                    const firstSuggestion = automationSynthesisSuggestions[0];
                    console.log(`Status: ${followups.length} interop followup(s) queued.`);
                    console.log(`Affected targets: ${affectedTargets}`);
                    console.log(`Automation synthesis: ${automationSynthesisSuggestions.length} suggestion(s)` +
                        (firstSuggestion ? ` (${firstSuggestion.templateType})` : ''));
                    console.log(`Next action: ${followups[0]?.nextActionText ?? 'review followup payload details.'}`);
                }
            }
            return ExitCode.Success;
        }
        if (sub === 'draft') {
            const fromProposal = valueFor('--from-proposal');
            const compiled = engine.compileInteropRequestDraft(cwd, fromProposal ? { proposalPath: fromProposal } : {});
            const payload = { artifactPath: compiled.artifactPath, draft: compiled.draft };
            if (options.format === 'json') {
                emitJsonOutput({ cwd, command: 'interop', payload: { command: 'interop', subcommand: sub, payload } });
            }
            else if (!options.quiet) {
                console.log(`draftId: ${compiled.draft.draftId}`);
                console.log(`proposalId: ${compiled.draft.proposalId}`);
                console.log(`target: ${compiled.draft.target}`);
                console.log(`action: ${compiled.draft.action}`);
                console.log(`capability: ${compiled.draft.capability}`);
                console.log(`expected receipt: ${compiled.draft.expected_receipt_type}`);
                console.log(`artifact: ${compiled.artifactPath}`);
            }
            return ExitCode.Success;
        }
        if (sub === 'fitness-contract') {
            const payload = await toFitnessContractInspectPayload(cwd);
            if (options.format === 'json') {
                emitJsonOutput({ cwd, command: 'interop', payload: { command: 'interop', subcommand: sub, payload } });
            }
            else if (!options.quiet) {
                console.log(`sourceRepo: ${payload.sourceRepo}`);
                console.log(`sourceRef: ${payload.sourceRef}`);
                console.log(`sourcePath: ${payload.sourcePath}`);
                console.log(`syncMode: ${payload.syncMode}`);
                console.log(`sourceHash: ${payload.sourceHash}`);
                console.log(`app: ${payload.canonicalPayloadSummary.appIdentity.kind}@${payload.canonicalPayloadSummary.appIdentity.schemaVersion}`);
                console.log(`signals: ${payload.canonicalPayloadSummary.signalNames.join(', ')}`);
                console.log(`state snapshots: ${payload.canonicalPayloadSummary.stateSnapshotTypes.join(', ')}`);
                console.log(`bounded actions: ${payload.canonicalPayloadSummary.boundedActionNames.join(', ')}`);
                console.log(`receipts: ${payload.canonicalPayloadSummary.receiptTypes.join(', ')}`);
            }
            return ExitCode.Success;
        }
        let runtime = engine.readInteropRuntime(cwd);
        if (sub === 'register') {
            const capability = valueFor('--capability') ?? 'lifeline-remediation-v1';
            const action = (valueFor('--action') ?? 'adjust_upcoming_workout_load');
            if (!actionKinds.includes(action))
                throw new Error(`Unsupported --action ${action}`);
            const actionContract = fitnessIntegrationContract.actions.find((entry) => entry.name === action);
            runtime = engine.registerInteropCapability(runtime, {
                capability_id: capability,
                action_kind: action,
                receipt_type: actionContract.receiptType,
                routing: actionContract.routing,
                version: '1.0.0',
                runtime_id: runtimeId,
                idempotency_key_prefix: `lifeline:${action}`
            });
            engine.writeInteropRuntime(cwd, runtime);
        }
        else if (sub === 'emit') {
            const capability = valueFor('--capability') ?? 'lifeline-remediation-v1';
            const action = (valueFor('--action') ?? 'adjust_upcoming_workout_load');
            if (!actionKinds.includes(action))
                throw new Error(`Unsupported --action ${action}`);
            const boundedActionInput = actionInputJson
                ? JSON.parse(actionInputJson)
                : defaultBoundedActionInputByAction[action];
            const { manifest, evaluation } = readRendezvous(cwd);
            const emitted = engine.emitBoundedInteropActionRequest({
                runtime,
                manifest,
                evaluation,
                action_kind: action,
                bounded_action_input: boundedActionInput,
                capability_id: capability
            });
            runtime = emitted.runtime;
            engine.writeInteropRuntime(cwd, runtime);
        }
        else if (sub === 'emit-fitness-plan') {
            const directAction = valueFor('--action');
            const directCapability = valueFor('--capability');
            if (fromDraft && (directAction || directCapability || actionInputJson)) {
                throw new Error('Cannot emit plan-derived Fitness request: --from-draft cannot be combined with --capability, --action, or --action-input-json.');
            }
            const draft = fromDraft ? engine.readInteropRequestDraft(cwd, { draftPath: fromDraft }).draft : null;
            const capability = draft ? String(draft.capability) : (directCapability ?? 'lifeline-remediation-v1');
            const action = (draft ? String(draft.action) : (directAction ?? 'adjust_upcoming_workout_load'));
            if (!actionKinds.includes(action))
                throw new Error(`Unsupported --action ${action}`);
            const boundedActionInput = draft
                ? draft.bounded_action_input
                : actionInputJson
                    ? JSON.parse(actionInputJson)
                    : defaultBoundedActionInputByAction[action];
            const approvedPlan = commandArgs.includes('--approved-plan');
            const readiness = readPlanDerivedReadiness(cwd, approvedPlan);
            const emitted = readiness.source === 'rendezvous'
                ? engine.emitPlanDerivedFitnessRequest({
                    runtime,
                    readiness: {
                        source: 'rendezvous',
                        manifest: readiness.manifest,
                        evaluation: readiness.evaluation
                    },
                    action_kind: action,
                    bounded_action_input: boundedActionInput,
                    capability_id: capability
                })
                : engine.emitPlanDerivedFitnessRequest({
                    runtime,
                    readiness: {
                        source: 'approved-plan',
                        plan: readiness.plan,
                        approved: Boolean(readiness.approved),
                        remediation_id: readiness.remediation_id,
                        required_artifact_ids: readiness.required_artifact_ids
                    },
                    action_kind: action,
                    bounded_action_input: boundedActionInput,
                    capability_id: capability
                });
            if (draft) {
                const emittedRequest = emitted.request;
                if (emittedRequest.action_kind !== draft.action) {
                    throw new Error(`Cannot emit plan-derived Fitness request: emitted action ${emittedRequest.action_kind} does not match draft action ${draft.action}.`);
                }
                if (emittedRequest.capability_id !== draft.capability) {
                    throw new Error(`Cannot emit plan-derived Fitness request: emitted capability ${emittedRequest.capability_id} does not match draft capability ${draft.capability}.`);
                }
                if (emittedRequest.receipt_type !== draft.expected_receipt_type) {
                    throw new Error(`Cannot emit plan-derived Fitness request: emitted receipt type ${emittedRequest.receipt_type} does not match draft expected receipt type ${draft.expected_receipt_type}.`);
                }
                if (emittedRequest.routing.channel !== draft.routing_metadata.channel
                    || emittedRequest.routing.target !== draft.routing_metadata.target
                    || emittedRequest.routing.priority !== draft.routing_metadata.priority
                    || emittedRequest.routing.maxDeliveryLatencySeconds !== draft.routing_metadata.maxDeliveryLatencySeconds) {
                    throw new Error('Cannot emit plan-derived Fitness request: emitted routing does not match draft routing metadata.');
                }
            }
            runtime = emitted.runtime;
            engine.writeInteropRuntime(cwd, runtime);
        }
        else if (sub === 'run-mock') {
            runtime = engine.runLifelineMockRuntimeOnce(runtime, runtimeId);
            engine.writeInteropRuntime(cwd, runtime);
        }
        else if (sub === 'reconcile') {
            const reconciled = await engine.reconcileInteropRuntime(cwd, runtime);
            runtime = reconciled.runtime;
            engine.writeInteropRuntime(cwd, runtime);
            const payload = {
                runtime,
                updated_truth: reconciled.updatedTruth,
                written_artifacts: {
                    interop_runtime: '.playbook/lifeline-interop-runtime.json',
                    interop_updated_truth: reconciled.updatedTruthPath
                }
            };
            if (options.format === 'json') {
                emitJsonOutput({ cwd, command: 'interop', payload: { command: 'interop', subcommand: sub, payload } });
            }
            else if (!options.quiet) {
                console.log(JSON.stringify(payload, null, 2));
            }
            return ExitCode.Success;
        }
        const payload = sub === 'capabilities' ? runtime.capabilities
            : sub === 'requests' ? runtime.requests
                : sub === 'receipts' ? runtime.receipts
                    : sub === 'health' ? runtime.heartbeat
                        : runtime;
        if (options.format === 'json') {
            emitJsonOutput({ cwd, command: 'interop', payload: { command: 'interop', subcommand: sub, payload } });
        }
        else if (!options.quiet) {
            console.log(JSON.stringify(payload, null, 2));
        }
        return ExitCode.Success;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.format === 'json')
            console.log(JSON.stringify({ schemaVersion: '1.0', command: 'interop', error: message }, null, 2));
        else
            console.error(message);
        return ExitCode.Failure;
    }
};
//# sourceMappingURL=interop.js.map