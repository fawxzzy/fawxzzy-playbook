import fs from 'node:fs';
import path from 'node:path';
import { KNOWLEDGE_REVIEW_RECEIPTS_RELATIVE_PATH, REVIEW_DOWNSTREAM_FOLLOWUPS_RELATIVE_PATH, REVIEW_HANDOFF_ROUTES_RELATIVE_PATH, REVIEW_HANDOFFS_RELATIVE_PATH, REVIEW_QUEUE_RELATIVE_PATH, buildReviewDownstreamFollowupsArtifact, buildReviewHandoffRoutesArtifact, buildReviewQueue, buildReviewHandoffsArtifact, writeReviewDownstreamFollowupsArtifact, writeReviewHandoffRoutesArtifact, writeKnowledgeReviewReceipt, writeReviewHandoffsArtifact, writeReviewQueueArtifact } from '@zachariahredfield/playbook-engine';
import { readOptionValue, readOptionValues, resolveSubcommandArgument } from './shared.js';
const reviewActions = ['reaffirm', 'revise', 'supersede'];
const reviewKinds = ['knowledge', 'doc', 'rule', 'pattern'];
const reviewDecisions = ['reaffirm', 'revise', 'supersede', 'defer'];
const dueFilters = ['now', 'overdue', 'all'];
const triggerFilters = ['cadence', 'evidence', 'all'];
const parseActionFilter = (raw) => {
    if (raw === null) {
        return undefined;
    }
    if (reviewActions.includes(raw)) {
        return raw;
    }
    throw new Error(`playbook knowledge review: invalid --action value "${raw}"; expected reaffirm, revise, or supersede`);
};
const parseKindFilter = (raw) => {
    if (raw === null) {
        return undefined;
    }
    if (reviewKinds.includes(raw)) {
        return raw;
    }
    throw new Error(`playbook knowledge review: invalid --kind value "${raw}"; expected knowledge, doc, rule, or pattern`);
};
const parseDueFilter = (raw) => {
    if (raw === null) {
        return 'all';
    }
    if (dueFilters.includes(raw)) {
        return raw;
    }
    throw new Error(`playbook knowledge review: invalid --due value "${raw}"; expected now, overdue, or all`);
};
const parseTriggerFilter = (raw) => {
    if (raw === null) {
        return 'all';
    }
    if (triggerFilters.includes(raw)) {
        return raw;
    }
    throw new Error(`playbook knowledge review: invalid --trigger value "${raw}"; expected cadence, evidence, or all`);
};
const parseRecordDecision = (raw) => {
    if (raw === null) {
        throw new Error('playbook knowledge review record: missing required --decision <reaffirm|revise|supersede|defer>');
    }
    if (reviewDecisions.includes(raw)) {
        return raw;
    }
    throw new Error(`playbook knowledge review record: invalid --decision value "${raw}"; expected reaffirm, revise, supersede, or defer`);
};
const parseHandoffDecisionFilter = (raw) => {
    if (raw === null) {
        return undefined;
    }
    if (raw === 'revise' || raw === 'supersede') {
        return raw;
    }
    throw new Error(`playbook knowledge review handoffs: invalid --decision value "${raw}"; expected revise or supersede`);
};
const parseRouteSurfaceFilter = (raw, surfaceName = 'routes') => {
    if (raw === null) {
        return undefined;
    }
    if (raw === 'story' || raw === 'promote' || raw === 'docs' || raw === 'memory') {
        return raw;
    }
    throw new Error(`playbook knowledge review ${surfaceName}: invalid --surface value "${raw}"; expected story, promote, docs, or memory`);
};
const readReviewQueueArtifact = (cwd) => {
    const fullPath = path.join(cwd, REVIEW_QUEUE_RELATIVE_PATH);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`playbook knowledge review: missing artifact at ${REVIEW_QUEUE_RELATIVE_PATH}`);
    }
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
};
const asReviewKind = (entry) => {
    const targetKind = String(entry.targetKind);
    if (targetKind === 'knowledge' || targetKind === 'doc' || targetKind === 'rule' || targetKind === 'pattern') {
        return targetKind;
    }
    return 'knowledge';
};
const asReviewKindValue = (targetKind) => {
    if (targetKind === 'knowledge' || targetKind === 'doc' || targetKind === 'rule' || targetKind === 'pattern') {
        return targetKind;
    }
    return 'knowledge';
};
const zeroActionSummary = () => ({ reaffirm: 0, revise: 0, supersede: 0 });
const zeroKindSummary = () => ({ knowledge: 0, doc: 0, rule: 0, pattern: 0 });
const materializeReviewQueue = (cwd) => {
    const materialized = buildReviewQueue(cwd);
    writeReviewQueueArtifact(cwd, materialized);
    return readReviewQueueArtifact(cwd);
};
const materializeReviewHandoffs = (cwd) => {
    const materialized = buildReviewHandoffsArtifact(cwd);
    writeReviewHandoffsArtifact(cwd, materialized);
    const fullPath = path.join(cwd, REVIEW_HANDOFFS_RELATIVE_PATH);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`playbook knowledge review handoffs: missing artifact at ${REVIEW_HANDOFFS_RELATIVE_PATH}`);
    }
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
};
const materializeReviewHandoffRoutes = (cwd) => {
    const materialized = buildReviewHandoffRoutesArtifact(cwd);
    writeReviewHandoffRoutesArtifact(cwd, materialized);
    const fullPath = path.join(cwd, REVIEW_HANDOFF_ROUTES_RELATIVE_PATH);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`playbook knowledge review routes: missing artifact at ${REVIEW_HANDOFF_ROUTES_RELATIVE_PATH}`);
    }
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
};
const materializeReviewDownstreamFollowups = (cwd) => {
    const materialized = buildReviewDownstreamFollowupsArtifact(cwd);
    writeReviewDownstreamFollowupsArtifact(cwd, materialized);
    const fullPath = path.join(cwd, REVIEW_DOWNSTREAM_FOLLOWUPS_RELATIVE_PATH);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`playbook knowledge review followups: missing artifact at ${REVIEW_DOWNSTREAM_FOLLOWUPS_RELATIVE_PATH}`);
    }
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
};
const isOverdueEntry = (entry) => entry.overdue === true;
const isDeferredEntry = (entry) => typeof entry.deferredUntil === 'string' && entry.deferredUntil.length > 0;
const matchesDueFilter = (entry, dueFilter) => {
    if (dueFilter === 'all') {
        return true;
    }
    if (dueFilter === 'overdue') {
        return isOverdueEntry(entry);
    }
    return !isDeferredEntry(entry) || isOverdueEntry(entry);
};
const summarizeCadence = (entries) => ({
    dueNow: entries.filter((entry) => !isDeferredEntry(entry) || isOverdueEntry(entry)).length,
    overdue: entries.filter((entry) => isOverdueEntry(entry)).length,
    deferred: entries.filter((entry) => isDeferredEntry(entry) && !isOverdueEntry(entry)).length,
    evidenceTriggered: entries.filter((entry) => includesEvidenceTrigger(entry)).length,
    interopTriggered: entries.filter((entry) => entry.triggerSource === 'interop-followup').length
});
const summarizeTriggers = (entries) => ({
    cadence: entries.filter((entry) => entry.triggerType === 'cadence').length,
    evidence: entries.filter((entry) => entry.triggerType === 'evidence').length,
    mixed: entries.filter((entry) => entry.triggerType === 'cadence+evidence').length
});
const includesCadenceTrigger = (entry) => entry.triggerType === 'cadence' || entry.triggerType === 'cadence+evidence';
const includesEvidenceTrigger = (entry) => entry.triggerType === 'evidence' || entry.triggerType === 'cadence+evidence';
const matchesTriggerFilter = (entry, triggerFilter) => {
    if (triggerFilter === 'all') {
        return true;
    }
    if (triggerFilter === 'cadence') {
        return includesCadenceTrigger(entry);
    }
    return includesEvidenceTrigger(entry);
};
const enrichEntry = (entry) => ({
    ...entry,
    triggerType: entry.triggerType,
    triggerReasonCode: entry.triggerReasonCode,
    triggerSource: entry.triggerSource,
    triggerEvidenceRefs: [...entry.triggerEvidenceRefs]
});
const runKnowledgeReviewList = (cwd, args) => {
    const actionFilter = parseActionFilter(readOptionValue(args, '--action'));
    const kindFilter = parseKindFilter(readOptionValue(args, '--kind'));
    const dueFilter = parseDueFilter(readOptionValue(args, '--due'));
    const triggerFilter = parseTriggerFilter(readOptionValue(args, '--trigger'));
    const triggerSourceFilter = readOptionValue(args, '--trigger-source') ?? undefined;
    const reviewQueue = materializeReviewQueue(cwd);
    const entries = reviewQueue.entries.filter((entry) => {
        const entryKind = asReviewKind(entry);
        if (actionFilter && entry.recommendedAction !== actionFilter) {
            return false;
        }
        if (kindFilter && entryKind !== kindFilter) {
            return false;
        }
        if (!matchesDueFilter(entry, dueFilter)) {
            return false;
        }
        if (!matchesTriggerFilter(entry, triggerFilter)) {
            return false;
        }
        if (triggerSourceFilter && entry.triggerSource !== triggerSourceFilter) {
            return false;
        }
        return true;
    });
    const byAction = zeroActionSummary();
    const byKind = zeroKindSummary();
    for (const entry of entries) {
        byAction[entry.recommendedAction] += 1;
        byKind[asReviewKind(entry)] += 1;
    }
    const enrichedEntries = entries.map(enrichEntry);
    return {
        schemaVersion: '1.0',
        command: 'knowledge-review',
        artifactPath: REVIEW_QUEUE_RELATIVE_PATH,
        generatedAt: reviewQueue.generatedAt,
        reviewOnly: true,
        authority: 'read-only',
        filters: {
            ...(actionFilter ? { action: actionFilter } : {}),
            ...(kindFilter ? { kind: kindFilter } : {}),
            due: dueFilter,
            trigger: triggerFilter,
            ...(triggerSourceFilter ? { triggerSource: triggerSourceFilter } : {})
        },
        summary: {
            total: reviewQueue.entries.length,
            returned: entries.length,
            byAction,
            byKind,
            cadence: summarizeCadence(enrichedEntries),
            triggers: summarizeTriggers(enrichedEntries)
        },
        entries: enrichedEntries
    };
};
const runKnowledgeReviewHandoffs = (cwd, args) => {
    const decisionFilter = parseHandoffDecisionFilter(readOptionValue(args, '--decision'));
    const kindFilter = parseKindFilter(readOptionValue(args, '--kind'));
    const artifact = materializeReviewHandoffs(cwd);
    const handoffs = artifact.handoffs.filter((handoff) => {
        if (decisionFilter && handoff.decision !== decisionFilter) {
            return false;
        }
        if (kindFilter && asReviewKindValue(handoff.targetKind) !== kindFilter) {
            return false;
        }
        return true;
    });
    const byDecision = { revise: 0, supersede: 0 };
    const byKind = zeroKindSummary();
    for (const handoff of handoffs) {
        byDecision[handoff.decision] += 1;
        byKind[asReviewKindValue(handoff.targetKind)] += 1;
    }
    return {
        schemaVersion: '1.0',
        command: 'knowledge-review-handoffs',
        artifactPath: REVIEW_HANDOFFS_RELATIVE_PATH,
        generatedAt: artifact.generatedAt,
        reviewOnly: true,
        authority: 'read-only',
        proposalOnly: true,
        filters: {
            ...(decisionFilter ? { decision: decisionFilter } : {}),
            ...(kindFilter ? { kind: kindFilter } : {})
        },
        summary: {
            total: artifact.handoffs.length,
            returned: handoffs.length,
            byDecision,
            byKind
        },
        handoffs
    };
};
const runKnowledgeReviewRoutes = (cwd, args) => {
    const surfaceFilter = parseRouteSurfaceFilter(readOptionValue(args, '--surface'));
    const decisionFilter = parseHandoffDecisionFilter(readOptionValue(args, '--decision'));
    const kindFilter = parseKindFilter(readOptionValue(args, '--kind'));
    const handoffArtifact = materializeReviewHandoffs(cwd);
    const routeArtifact = materializeReviewHandoffRoutes(cwd);
    const decisionByHandoffId = new Map(handoffArtifact.handoffs.map((handoff) => [handoff.handoffId, handoff.decision]));
    const routes = routeArtifact.routes.filter((route) => {
        if (surfaceFilter && route.recommendedSurface !== surfaceFilter) {
            return false;
        }
        if (kindFilter && asReviewKindValue(route.targetKind) !== kindFilter) {
            return false;
        }
        if (decisionFilter && decisionByHandoffId.get(route.handoffId) !== decisionFilter) {
            return false;
        }
        return true;
    });
    const bySurface = { story: 0, promote: 0, docs: 0, memory: 0 };
    const byDecision = { revise: 0, supersede: 0 };
    const byKind = zeroKindSummary();
    for (const route of routes) {
        bySurface[route.recommendedSurface] += 1;
        byKind[asReviewKindValue(route.targetKind)] += 1;
        const decision = decisionByHandoffId.get(route.handoffId);
        if (decision === 'revise' || decision === 'supersede') {
            byDecision[decision] += 1;
        }
    }
    return {
        schemaVersion: '1.0',
        command: 'knowledge-review-routes',
        artifactPath: REVIEW_HANDOFF_ROUTES_RELATIVE_PATH,
        generatedAt: routeArtifact.generatedAt,
        reviewOnly: true,
        authority: 'read-only',
        proposalOnly: true,
        filters: {
            ...(surfaceFilter ? { surface: surfaceFilter } : {}),
            ...(decisionFilter ? { decision: decisionFilter } : {}),
            ...(kindFilter ? { kind: kindFilter } : {})
        },
        summary: {
            total: routeArtifact.routes.length,
            returned: routes.length,
            bySurface,
            byDecision,
            byKind
        },
        routes
    };
};
const runKnowledgeReviewFollowups = (cwd, args) => {
    const surfaceFilter = parseRouteSurfaceFilter(readOptionValue(args, '--surface'), 'followups');
    const kindFilter = parseKindFilter(readOptionValue(args, '--kind'));
    const artifact = materializeReviewDownstreamFollowups(cwd);
    const followups = artifact.followups.filter((followup) => {
        if (surfaceFilter && followup.recommendedSurface !== surfaceFilter) {
            return false;
        }
        if (kindFilter && asReviewKindValue(followup.targetKind) !== kindFilter) {
            return false;
        }
        return true;
    });
    const byType = {
        'docs-revision': 0,
        'promote-memory': 0,
        'story-seed': 0,
        supersession: 0
    };
    const bySurface = { story: 0, promote: 0, docs: 0, memory: 0 };
    const byKind = zeroKindSummary();
    for (const followup of followups) {
        byType[followup.type] += 1;
        bySurface[followup.recommendedSurface] += 1;
        byKind[asReviewKindValue(followup.targetKind)] += 1;
    }
    return {
        schemaVersion: '1.0',
        command: 'knowledge-review-followups',
        artifactPath: REVIEW_DOWNSTREAM_FOLLOWUPS_RELATIVE_PATH,
        generatedAt: artifact.generatedAt,
        reviewOnly: true,
        authority: 'read-only',
        proposalOnly: true,
        filters: {
            ...(kindFilter ? { kind: kindFilter } : {}),
            ...(surfaceFilter ? { surface: surfaceFilter } : {})
        },
        summary: {
            total: artifact.followups.length,
            returned: followups.length,
            byType,
            bySurface,
            byKind
        },
        followups
    };
};
const asRecordableTargetKind = (targetKind) => {
    if (targetKind === 'knowledge' || targetKind === 'doc') {
        return targetKind;
    }
    throw new Error(`playbook knowledge review record: unsupported target kind "${targetKind}" for receipt recording`);
};
const toNextAction = (decision) => {
    if (decision === 'reaffirm') {
        return 'no additional action required until next review window';
    }
    if (decision === 'defer') {
        return 'wait for defer window before the next review pass';
    }
    if (decision === 'revise') {
        return 'create and link the follow-up revision artifact explicitly';
    }
    return 'perform explicit supersession through the existing promotion/supersession workflow';
};
const runKnowledgeReviewRecord = (cwd, args) => {
    const queueEntryId = readOptionValue(args, '--from');
    if (!queueEntryId) {
        throw new Error('playbook knowledge review record: missing required --from <queueEntryId>');
    }
    if (readOptionValue(args, '--reviewed-by')) {
        throw new Error('playbook knowledge review record: --reviewed-by is not supported by the current receipt contract');
    }
    const decision = parseRecordDecision(readOptionValue(args, '--decision'));
    const reasonCode = readOptionValue(args, '--reason-code');
    const receiptId = readOptionValue(args, '--receipt-id') ?? undefined;
    const followupRefs = readOptionValues(args, '--followup-ref');
    const evidenceRefs = readOptionValues(args, '--evidence-ref');
    const reviewQueue = materializeReviewQueue(cwd);
    const queueEntry = reviewQueue.entries.find((entry) => entry.queueEntryId === queueEntryId);
    if (!queueEntry) {
        throw new Error(`playbook knowledge review record: queue entry not found for --from "${queueEntryId}"`);
    }
    const targetKind = asRecordableTargetKind(queueEntry.targetKind);
    const combinedEvidenceRefs = [...queueEntry.evidenceRefs, ...evidenceRefs]
        .filter((value, index, values) => typeof value === 'string' && value.length > 0 && values.indexOf(value) === index)
        .sort((left, right) => left.localeCompare(right));
    const nextArtifact = writeKnowledgeReviewReceipt(cwd, {
        ...(receiptId ? { receiptId } : {}),
        queueEntryId: queueEntry.queueEntryId,
        targetKind,
        ...(queueEntry.targetId ? { targetId: queueEntry.targetId } : {}),
        ...(queueEntry.path ? { path: queueEntry.path } : {}),
        sourceSurface: queueEntry.sourceSurface,
        reasonCode: reasonCode ?? queueEntry.reasonCode,
        decision,
        evidenceRefs: combinedEvidenceRefs,
        ...(followupRefs[0] ? { followUpArtifactPath: followupRefs[0] } : {})
    });
    const matchingReceipts = nextArtifact.receipts
        .filter((receipt) => receipt.queueEntryId === queueEntry.queueEntryId &&
        receipt.targetKind === targetKind &&
        (queueEntry.targetId ? receipt.targetId === queueEntry.targetId : true) &&
        (queueEntry.path ? receipt.path === queueEntry.path : true))
        .sort((left, right) => left.decidedAt.localeCompare(right.decidedAt) || left.receiptId.localeCompare(right.receiptId));
    const receipt = receiptId
        ? matchingReceipts.find((entry) => entry.receiptId === receiptId) ?? matchingReceipts.at(-1)
        : matchingReceipts.at(-1);
    if (!receipt) {
        throw new Error('playbook knowledge review record: failed to resolve recorded receipt entry');
    }
    return {
        schemaVersion: '1.0',
        command: 'knowledge-review-record',
        artifactPath: KNOWLEDGE_REVIEW_RECEIPTS_RELATIVE_PATH,
        reviewOnly: true,
        authority: 'explicit-review-receipt',
        queueEntryId: queueEntry.queueEntryId,
        decision,
        target: {
            targetKind,
            ...(queueEntry.targetId ? { targetId: queueEntry.targetId } : {}),
            ...(queueEntry.path ? { path: queueEntry.path } : {})
        },
        reasonCode: reasonCode ?? queueEntry.reasonCode,
        evidenceRefs: combinedEvidenceRefs,
        followupRefs,
        nextAction: toNextAction(decision),
        receipt
    };
};
export const runKnowledgeReview = (cwd, args) => {
    const reviewSubcommand = resolveSubcommandArgument(args);
    if (reviewSubcommand === 'record') {
        return runKnowledgeReviewRecord(cwd, args);
    }
    if (reviewSubcommand === 'handoffs') {
        return runKnowledgeReviewHandoffs(cwd, args);
    }
    if (reviewSubcommand === 'routes') {
        return runKnowledgeReviewRoutes(cwd, args);
    }
    if (reviewSubcommand === 'followups') {
        return runKnowledgeReviewFollowups(cwd, args);
    }
    return runKnowledgeReviewList(cwd, args);
};
//# sourceMappingURL=review.js.map