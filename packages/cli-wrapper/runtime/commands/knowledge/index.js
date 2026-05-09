import { runKnowledgeCompare } from './compare.js';
import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';
import { runKnowledgeInspect } from './inspect.js';
import { runKnowledgeList } from './list.js';
import { runKnowledgePortability, parsePortabilityView } from './portability.js';
import { runKnowledgeProvenance } from './provenance.js';
import { runKnowledgeQuery } from './query.js';
import { runKnowledgeReview } from './review.js';
import { printKnowledgeHelp, printKnowledgePortabilityHelp } from './shared.js';
import { runKnowledgeStale } from './stale.js';
import { runKnowledgeSupersession } from './supersession.js';
import { runKnowledgeTimeline } from './timeline.js';
const renderPortabilityText = (payload) => {
    const portability = payload.portability;
    if (!portability || portability.length === 0) {
        return 'No portability records found.';
    }
    return portability
        .map((entry) => `Pattern: ${String(entry.pattern_id)}

Source Repo:
${String(entry.source_repo)}

Portability Score:
${String(entry.portability_score)}

Evidence Runs:
${String(entry.evidence_runs)}

Compatible Subsystems:
${(entry.compatible_subsystems ?? []).map(String).join('\n')}

Risk Signals:
${(entry.risk_signals ?? []).map(String).join('\n')}`)
        .join('\n\n---\n\n');
};
const renderPortabilityRecommendationsText = (payload) => {
    const recommendations = payload.recommendations;
    if (!recommendations || recommendations.length === 0) {
        return 'No portability recommendations found.';
    }
    return recommendations
        .map((entry) => `Pattern: ${String(entry.pattern)}
Source Repo: ${String(entry.source_repo)}
Target Repo: ${String(entry.target_repo)}
Initial Portability Score: ${String(entry.initial_portability_score)}
Decision Status: ${String(entry.decision_status)}
Evidence Count: ${String(entry.evidence_count)}`)
        .join('\n\n---\n\n');
};
const renderPortabilityOutcomesText = (payload) => {
    const outcomes = payload.outcomes;
    if (!outcomes || outcomes.length === 0) {
        return 'No portability outcomes found.';
    }
    return outcomes
        .map((entry) => `Recommendation ID: ${String(entry.recommendation_id)}
Pattern: ${String(entry.pattern)}
Source Repo: ${String(entry.source_repo)}
Target Repo: ${String(entry.target_repo)}
Initial Portability Score: ${String(entry.initial_portability_score)}
Decision Status: ${String(entry.decision_status)}
Decision Reason: ${String(entry.decision_reason ?? 'n/a')}
Adoption Status: ${String(entry.adoption_status ?? 'n/a')}
Observed Outcome: ${String(entry.observed_outcome ?? 'n/a')}
Outcome Confidence: ${String(entry.outcome_confidence ?? 'n/a')}
Timestamp: ${String(entry.timestamp)}
Sample Size: ${String(entry.sample_size)}`)
        .join('\n\n---\n\n');
};
const renderTransferPlanningText = (entry) => `Pattern: ${String(entry.pattern)}
Source Repo: ${String(entry.source_repo ?? 'n/a')}
Target Repo: ${String(entry.target_repo)}
Portability Confidence: ${String(entry.portability_confidence ?? 'n/a')}
Readiness Score: ${String(entry.readiness_score ?? 'n/a')}
Recommendation: ${String(entry.recommendation ?? 'n/a')}
Gating Tier: ${String(entry.gating_tier ?? 'n/a')}
Touched Subsystems: ${(entry.touched_subsystems ?? entry.required_subsystems ?? []).map(String).join(', ') || 'none'}
Required Artifacts: ${(entry.required_artifacts ?? []).map(String).join(', ') || 'none'}
Required Validations: ${(entry.required_validations ?? []).map(String).join(', ') || 'none'}
Missing Prerequisites: ${(entry.missing_prerequisites ?? []).map(String).join(', ') || 'none'}
Blockers: ${(entry.blockers ?? []).map(String).join(', ') || 'none'}
Open Questions: ${(entry.open_questions ?? []).map(String).join(', ') || 'none'}`;
const renderTransferPlansText = (payload) => {
    const records = payload.transfer_plans;
    if (!records || records.length === 0) {
        return 'No transfer plans found.';
    }
    return records.map(renderTransferPlanningText).join('\n\n---\n\n');
};
const renderReadinessText = (payload) => {
    const records = payload.readiness;
    if (!records || records.length === 0) {
        return 'No transfer readiness records found.';
    }
    return records.map(renderTransferPlanningText).join('\n\n---\n\n');
};
const renderBlockedTransfersText = (payload) => {
    const records = payload.blocked_transfers;
    if (!records || records.length === 0) {
        return 'No blocked transfers found.';
    }
    return records.map(renderTransferPlanningText).join('\n\n---\n\n');
};
const renderPortabilityRecalibrationText = (payload) => {
    const recalibration = payload.recalibration;
    if (!recalibration || recalibration.length === 0) {
        return 'No portability confidence recalibration records found.';
    }
    return recalibration
        .map((entry) => `Pattern: ${String(entry.pattern)}
Source Repo: ${String(entry.source_repo)}
Target Repo: ${String(entry.target_repo)}
Initial Portability Score: ${String(entry.initial_portability_score)}
Recalibrated Confidence: ${String(entry.recalibrated_confidence)}
Evidence Count: ${String(entry.evidence_count)}
Sample Size: ${String(entry.sample_size)}`)
        .join('\n\n---\n\n');
};
const renderText = (subcommand, payload) => {
    if (subcommand === 'inspect') {
        const knowledge = payload.knowledge;
        return `Knowledge ${String(payload.id)} (${String(knowledge.type ?? 'unknown')}).`;
    }
    if (subcommand === 'provenance') {
        const provenance = payload.provenance;
        return `Resolved provenance for ${String(payload.id)} (${provenance?.evidence?.length ?? 0} evidence records, ${provenance?.relatedRecords?.length ?? 0} related records).`;
    }
    if (subcommand === 'compare') {
        return `Compared ${String(payload.leftId)} with ${String(payload.rightId)}.`;
    }
    if (subcommand === 'supersession') {
        const supersession = payload.supersession;
        return `Resolved supersession for ${String(payload.id)} (${supersession?.supersedes?.length ?? 0} supersedes, ${supersession?.supersededBy?.length ?? 0} superseded-by).`;
    }
    if (subcommand === 'portability') {
        const command = String(payload.command ?? '');
        if (command === 'knowledge-portability-recommendations') {
            return renderPortabilityRecommendationsText(payload);
        }
        if (command === 'knowledge-portability-outcomes') {
            return renderPortabilityOutcomesText(payload);
        }
        if (command === 'knowledge-portability-recalibration') {
            return renderPortabilityRecalibrationText(payload);
        }
        if (command === 'knowledge-portability-transfer-plans') {
            return renderTransferPlansText(payload);
        }
        if (command === 'knowledge-portability-readiness') {
            return renderReadinessText(payload);
        }
        if (command === 'knowledge-portability-blocked-transfers') {
            return renderBlockedTransfersText(payload);
        }
        return renderPortabilityText(payload);
    }
    if (subcommand === 'review') {
        if (String(payload.command ?? '') === 'knowledge-review-routes') {
            const routes = payload.routes;
            if (!routes || routes.length === 0) {
                return 'Status: no routed handoffs pending.\nAffected targets: none\nRecommended surface: none\nNext action: continue through existing review and governance surfaces.';
            }
            const first = routes[0];
            const affectedTargets = routes
                .slice(0, 3)
                .map((route) => String(route.targetId ?? route.path ?? 'target'))
                .join(', ');
            return [
                `Status: ${routes.length} routed handoff(s) pending`,
                `Affected targets: ${affectedTargets}`,
                `Recommended surface: ${String(first.recommendedSurface ?? 'n/a')}`,
                `Next action: ${String(first.nextActionText ?? 'review the routed handoff artifact for details')}`
            ].join('\n');
        }
        if (String(payload.command ?? '') === 'knowledge-review-followups') {
            const followups = payload.followups;
            if (!followups || followups.length === 0) {
                return 'Status: no downstream follow-up suggestions.\nAffected targets: none\nRecommended surface: none\nNext action: continue via existing review surfaces.';
            }
            const first = followups[0];
            const affectedTargets = followups
                .slice(0, 3)
                .map((followup) => String(followup.targetId ?? followup.path ?? 'target'))
                .join(', ');
            return [
                `Status: ${followups.length} downstream follow-up suggestion(s)`,
                `Affected targets: ${affectedTargets}`,
                `Recommended surface: ${String(first.recommendedSurface ?? 'n/a')}`,
                `Next action: ${String(first.nextActionText ?? 'review downstream follow-up suggestions')}`
            ].join('\n');
        }
        if (String(payload.command ?? '') === 'knowledge-review-handoffs') {
            const handoffs = payload.handoffs;
            if (!handoffs || handoffs.length === 0) {
                return 'Status: no review handoffs pending.\nAffected targets: none\nRecommended follow-up: none\nNext action: continue using existing review and promotion surfaces.';
            }
            const first = handoffs[0];
            const affectedTargets = handoffs
                .slice(0, 3)
                .map((handoff) => String(handoff.targetId ?? handoff.path ?? 'target'))
                .join(', ');
            return [
                `Status: ${handoffs.length} review handoff(s) pending`,
                `Affected targets: ${affectedTargets}`,
                `Recommended follow-up: ${String(first.recommendedFollowupType ?? 'n/a')} (${String(first.recommendedFollowupRef ?? 'n/a')})`,
                `Next action: ${String(first.nextActionText ?? 'review the handoff artifact for details')}`
            ].join('\n');
        }
        if (String(payload.command ?? '') === 'knowledge-review-record') {
            const target = payload.target;
            const affectedTarget = String(target?.targetId ?? target?.path ?? 'target');
            return [
                `Decision: ${String(payload.decision ?? 'n/a')}`,
                `Affected target: ${affectedTarget}`,
                `Next action: ${String(payload.nextAction ?? 'none')}`
            ].join('\n');
        }
        const entries = payload.entries;
        if (!entries || entries.length === 0) {
            return 'Status: review queue clear.\nDue now: 0\nEvidence-triggered: 0\nInterop-triggered: 0\nNext action: no review action required.';
        }
        const first = entries[0];
        const summary = payload.summary;
        const cadence = summary?.cadence;
        return [
            `Status: ${entries.length} review item(s) pending`,
            `Due now: ${String(cadence?.dueNow ?? entries.filter((entry) => !entry.deferredUntil || entry.overdue === true).length)}`,
            `Evidence-triggered: ${String(cadence?.evidenceTriggered ?? entries.filter((entry) => entry.triggerType === 'evidence' || entry.triggerType === 'cadence+evidence').length)}`,
            `Interop-triggered: ${String(cadence?.interopTriggered ?? entries.filter((entry) => entry.triggerSource === 'interop-followup').length)}`,
            `Next action: ${String(first.recommendedAction ?? 'review')} ${String(first.targetId ?? first.path ?? 'target')}`
        ].join('\n');
    }
    const knowledge = payload.knowledge;
    return `Found ${knowledge?.length ?? 0} knowledge records.`;
};
export const runKnowledge = async (cwd, args, options) => {
    const subcommand = args.find((arg) => !arg.startsWith('-'));
    if (!subcommand || args.includes('--help') || args.includes('-h')) {
        if (subcommand === 'portability') {
            printKnowledgePortabilityHelp();
            return ExitCode.Success;
        }
        printKnowledgeHelp();
        return subcommand ? ExitCode.Success : ExitCode.Failure;
    }
    try {
        const payload = (() => {
            if (subcommand === 'list') {
                return runKnowledgeList(cwd, args);
            }
            if (subcommand === 'query') {
                return runKnowledgeQuery(cwd, args);
            }
            if (subcommand === 'inspect') {
                return runKnowledgeInspect(cwd, args);
            }
            if (subcommand === 'compare') {
                return runKnowledgeCompare(cwd, args);
            }
            if (subcommand === 'timeline') {
                return runKnowledgeTimeline(cwd, args);
            }
            if (subcommand === 'provenance') {
                return runKnowledgeProvenance(cwd, args);
            }
            if (subcommand === 'supersession') {
                return runKnowledgeSupersession(cwd, args);
            }
            if (subcommand === 'stale') {
                return runKnowledgeStale(cwd, args);
            }
            if (subcommand === 'portability') {
                return runKnowledgePortability(cwd, parsePortabilityView(args));
            }
            if (subcommand === 'review') {
                return runKnowledgeReview(cwd, args);
            }
            throw new Error('playbook knowledge: unsupported subcommand. Use list, query, inspect, compare, timeline, provenance, supersession, stale, portability, review, review handoffs, review routes, review followups, or review record.');
        })();
        if (options.format === 'json') {
            emitJsonOutput({ cwd, command: `knowledge ${subcommand}`, payload });
        }
        else if (!options.quiet) {
            console.log(renderText(subcommand, payload));
        }
        return ExitCode.Success;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.format === 'json') {
            console.log(JSON.stringify({ schemaVersion: '1.0', command: `knowledge-${subcommand}`, error: message }, null, 2));
        }
        else {
            console.error(message);
        }
        return ExitCode.Failure;
    }
};
//# sourceMappingURL=index.js.map