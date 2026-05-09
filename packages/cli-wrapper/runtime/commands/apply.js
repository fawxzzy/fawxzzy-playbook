import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import * as engine from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
import { writeJsonArtifactAbsolute } from '../lib/jsonArtifact.js';
import { loadVerifyRules } from '../lib/loadVerifyRules.js';
import { warn } from '../lib/output.js';
import { buildPlanRemediation, deriveVerifyFailureFacts, parsePlanRemediation, remediationToApplyPrecondition } from '../lib/remediationContract.js';
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16BE_BOM = Buffer.from([0xfe, 0xff]);
const POLICY_APPLY_RESULT_RELATIVE_PATH = '.playbook/policy-apply-result.json';
const stripLeadingBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
const inferUtf16WithoutBom = (buffer) => {
    if (buffer.length < 4 || buffer.length % 2 !== 0) {
        return null;
    }
    let evenNulls = 0;
    let oddNulls = 0;
    const pairCount = Math.floor(buffer.length / 2);
    for (let index = 0; index < buffer.length; index += 2) {
        if (buffer[index] === 0x00) {
            evenNulls += 1;
        }
        if (buffer[index + 1] === 0x00) {
            oddNulls += 1;
        }
    }
    const threshold = Math.max(2, Math.floor(pairCount * 0.6));
    if (oddNulls >= threshold && evenNulls === 0) {
        return 'utf16le';
    }
    if (evenNulls >= threshold && oddNulls === 0) {
        return 'utf16be';
    }
    return null;
};
const decodePlanPayload = (buffer) => {
    if (buffer.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)) {
        return { text: stripLeadingBom(buffer.toString('utf8')), likelyShellEncodingIssue: false };
    }
    if (buffer.subarray(0, UTF16LE_BOM.length).equals(UTF16LE_BOM)) {
        return { text: stripLeadingBom(buffer.subarray(UTF16LE_BOM.length).toString('utf16le')), likelyShellEncodingIssue: true };
    }
    if (buffer.subarray(0, UTF16BE_BOM.length).equals(UTF16BE_BOM)) {
        const littleEndianBuffer = Buffer.from(buffer.subarray(UTF16BE_BOM.length));
        littleEndianBuffer.swap16();
        return { text: stripLeadingBom(littleEndianBuffer.toString('utf16le')), likelyShellEncodingIssue: true };
    }
    const inferredUtf16 = inferUtf16WithoutBom(buffer);
    if (inferredUtf16 === 'utf16le') {
        return { text: stripLeadingBom(buffer.toString('utf16le')), likelyShellEncodingIssue: true };
    }
    if (inferredUtf16 === 'utf16be') {
        const littleEndianBuffer = Buffer.from(buffer);
        littleEndianBuffer.swap16();
        return { text: stripLeadingBom(littleEndianBuffer.toString('utf16le')), likelyShellEncodingIssue: true };
    }
    return { text: stripLeadingBom(buffer.toString('utf8')), likelyShellEncodingIssue: false };
};
const toPolicyApplyResultArtifact = (results) => {
    const executed = [];
    const skippedRequiresReview = [];
    const skippedBlocked = [];
    const failedExecution = [];
    for (const result of results) {
        const reason = result.message ?? `${result.ruleId} ${result.status}`;
        if (result.status === 'failed') {
            failedExecution.push({
                proposal_id: result.id,
                decision: 'safe',
                reason,
                error: result.message ?? `Task ${result.id} failed during execution.`
            });
            continue;
        }
        if (result.status === 'unsupported') {
            skippedBlocked.push({
                proposal_id: result.id,
                decision: 'blocked',
                reason
            });
            continue;
        }
        if (result.status === 'skipped') {
            skippedRequiresReview.push({
                proposal_id: result.id,
                decision: 'requires_review',
                reason
            });
            continue;
        }
        executed.push({
            proposal_id: result.id,
            decision: 'safe',
            reason
        });
    }
    return {
        schemaVersion: '1.0',
        kind: 'policy-apply-result',
        executed,
        skipped_requires_review: skippedRequiresReview,
        skipped_blocked: skippedBlocked,
        failed_execution: failedExecution,
        summary: {
            executed: executed.length,
            skipped_requires_review: skippedRequiresReview.length,
            skipped_blocked: skippedBlocked.length,
            failed_execution: failedExecution.length,
            total: results.length
        }
    };
};
const writeCanonicalApplyArtifact = (cwd, results) => {
    const artifactPath = path.resolve(cwd, POLICY_APPLY_RESULT_RELATIVE_PATH);
    writeJsonArtifactAbsolute(artifactPath, toPolicyApplyResultArtifact(results), 'apply', { envelope: false });
    return artifactPath;
};
const readRequiredNonNegativeInteger = (value, fieldName) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new Error(`Invalid test-fix-plan payload: ${fieldName} must be a non-negative integer.`);
    }
    return value;
};
const normalizeReleasePlanArtifact = (normalizedPayload) => {
    if (normalizedPayload.kind !== 'playbook-release-plan') {
        throw new Error('Invalid release-plan payload: kind must be "playbook-release-plan".');
    }
    const tasksPayload = normalizedPayload.tasks;
    if (!Array.isArray(tasksPayload)) {
        throw new Error('Invalid release-plan payload: tasks must be an array.');
    }
    const parsedPlan = engine.parsePlanArtifact({
        schemaVersion: normalizedPayload.schemaVersion,
        command: 'plan',
        tasks: tasksPayload
    });
    const packageEntries = Array.isArray(normalizedPayload.packages) ? normalizedPayload.packages : [];
    const versionGroups = Array.isArray(normalizedPayload.versionGroups) ? normalizedPayload.versionGroups : [];
    const taskByFile = new Map(parsedPlan.tasks.map((task) => [task.file, task]));
    const releaseLockstepGroups = versionGroups
        .map((group) => {
        if (!group || typeof group !== 'object') {
            return null;
        }
        const typedGroup = group;
        const packageNames = Array.isArray(typedGroup.packages) ? typedGroup.packages.filter((value) => typeof value === 'string') : [];
        const taskIds = packageEntries
            .filter((entry) => entry && typeof entry === 'object' && packageNames.includes(String(entry.name ?? '')))
            .map((entry) => {
            const task = taskByFile.get(`${String(entry.path)}/package.json`);
            return task ? task.id : null;
        })
            .filter((value) => value !== null);
        return typeof typedGroup.name === 'string' && taskIds.length > 0 ? { name: typedGroup.name, taskIds } : null;
    })
        .filter((value) => value !== null);
    return {
        tasks: parsedPlan.tasks,
        remediation: buildPlanRemediation({
            failureCount: parsedPlan.tasks.length,
            stepCount: parsedPlan.tasks.length,
            unavailableReason: 'Release plan produced no bounded mutation tasks. Review the release artifact before attempting apply.'
        }),
        releaseLockstepGroups
    };
};
const validateReleaseTaskSelection = (selection, selectedTasks) => {
    if (!selection.releaseLockstepGroups || selection.releaseLockstepGroups.length === 0) {
        return;
    }
    const selectedIds = new Set(selectedTasks.map((task) => task.id));
    for (const group of selection.releaseLockstepGroups) {
        const selectedGroupTaskIds = group.taskIds.filter((taskId) => selectedIds.has(taskId));
        if (selectedGroupTaskIds.length > 0 && selectedGroupTaskIds.length !== group.taskIds.length) {
            throw new Error(`Release plan task selection is partial for lockstep group ${group.name}. Select all package version tasks in the group or omit them entirely.`);
        }
    }
};
const normalizeApplyPlanArtifact = (payload) => {
    const normalizedPayload = payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload
        ? payload.data
        : payload;
    if (!normalizedPayload || typeof normalizedPayload !== 'object') {
        throw new Error('Invalid plan payload: expected an object envelope.');
    }
    if (normalizedPayload.command === 'plan') {
        return {
            tasks: engine.parsePlanArtifact(payload).tasks,
            remediation: parsePlanRemediation(normalizedPayload.remediation)
        };
    }
    if (normalizedPayload.command === 'test-fix-plan') {
        const parsedPlan = engine.parsePlanArtifact({
            schemaVersion: normalizedPayload.schemaVersion,
            command: 'plan',
            tasks: normalizedPayload.tasks
        });
        const summary = normalizedPayload.summary;
        if (!summary || typeof summary !== 'object') {
            throw new Error('Invalid test-fix-plan payload: summary must be an object.');
        }
        const typedSummary = summary;
        const totalFindings = readRequiredNonNegativeInteger(typedSummary.total_findings, 'summary.total_findings');
        const excludedFindings = readRequiredNonNegativeInteger(typedSummary.excluded_findings, 'summary.excluded_findings');
        return {
            tasks: parsedPlan.tasks,
            remediation: buildPlanRemediation({
                failureCount: totalFindings,
                stepCount: parsedPlan.tasks.length,
                unresolvedFailureCount: excludedFindings,
                unavailableReason: 'Test-fix-plan produced no executable low-risk tasks. Review exclusions before attempting apply.'
            })
        };
    }
    if (normalizedPayload.kind === 'playbook-release-plan') {
        return normalizeReleasePlanArtifact(normalizedPayload);
    }
    if (normalizedPayload.command === 'docs-consolidate-plan') {
        const parsedPlan = engine.parsePlanArtifact({
            schemaVersion: normalizedPayload.schemaVersion,
            command: 'plan',
            tasks: normalizedPayload.tasks
        });
        const summary = normalizedPayload.summary;
        if (!summary || typeof summary !== 'object') {
            throw new Error('Invalid docs-consolidation-plan payload: summary must be an object.');
        }
        const typedSummary = summary;
        const totalTargets = readRequiredNonNegativeInteger(typedSummary.total_targets, 'summary.total_targets');
        const excludedTargets = readRequiredNonNegativeInteger(typedSummary.excluded_targets, 'summary.excluded_targets');
        return {
            tasks: parsedPlan.tasks,
            remediation: buildPlanRemediation({
                failureCount: totalTargets,
                stepCount: parsedPlan.tasks.length,
                unresolvedFailureCount: excludedTargets,
                unavailableReason: 'Docs consolidation plan produced no executable managed-write tasks. Review exclusions before attempting apply.'
            })
        };
    }
    if (normalizedPayload.kind === 'playbook-maintenance-plan') {
        const maintenanceRows = Array.isArray(normalizedPayload.maintenanceRows) ? normalizedPayload.maintenanceRows.length : 0;
        return {
            tasks: [],
            remediation: buildPlanRemediation({
                failureCount: maintenanceRows,
                stepCount: 0,
                unresolvedFailureCount: maintenanceRows,
                unavailableReason: 'Maintenance plans require explicit approval + policy gating before execution.'
            })
        };
    }
    throw new Error('Invalid plan payload: command must be "plan", "test-fix-plan", or "docs-consolidate-plan", or kind must be "playbook-release-plan" or "playbook-maintenance-plan".');
};
const loadMaintenanceApprovals = (cwd, approvalsPath) => {
    const resolvedPath = path.resolve(cwd, approvalsPath);
    let rawPayload = '';
    try {
        rawPayload = fs.readFileSync(resolvedPath, 'utf8');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to read maintenance approvals file at ${resolvedPath}: ${message}`);
    }
    return engine.parseMaintenanceApprovals(rawPayload, approvalsPath);
};
const loadPlanFromFile = (cwd, fromPlan, options) => {
    const resolvedPath = path.resolve(cwd, fromPlan);
    let rawPayload = '';
    let likelyShellEncodingIssue = false;
    try {
        const rawBytes = fs.readFileSync(resolvedPath);
        const decodedPayload = decodePlanPayload(rawBytes);
        rawPayload = decodedPayload.text;
        likelyShellEncodingIssue = decodedPayload.likelyShellEncodingIssue;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to read plan file at ${resolvedPath}: ${message}`);
    }
    let payload;
    try {
        payload = JSON.parse(rawPayload);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const encodingHint = likelyShellEncodingIssue
            ? ' The file appears to use a shell-specific encoding (for example UTF-16/BOM from PowerShell redirection). Re-write the plan file as UTF-8 and retry.'
            : '';
        throw new Error(`Invalid plan JSON in ${resolvedPath}: ${message}.${encodingHint}`);
    }
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.kind === 'playbook-maintenance-plan') {
        const approvalsPath = options.maintenanceApprovalsPath ?? engine.MAINTENANCE_APPROVALS_RELATIVE_PATH;
        const approvals = loadMaintenanceApprovals(cwd, approvalsPath);
        const policy = loadPolicyEvaluationArtifact(cwd);
        const tasks = engine.buildApprovedMaintenanceTasks(payload, approvals, policy, { repoRoot: cwd });
        return {
            tasks: tasks.map((task) => ({
                id: task.id,
                ruleId: 'maintenance.execution',
                file: null,
                action: task.command,
                autoFix: false,
                task_kind: 'maintenance-execution',
                provenance: {
                    maintenance_id: task.maintenanceId,
                    maintenance_type: task.maintenanceType,
                    bounded_target_surface: task.boundedTargetSurface,
                    approval_ref: task.approvalRef,
                    policy_ref: task.policyRef,
                    source_evidence_refs: task.sourceEvidenceRefs
                }
            })),
            remediation: buildPlanRemediation({ failureCount: tasks.length, stepCount: tasks.length, unresolvedFailureCount: 0 }),
            maintenanceExecution: {
                sourcePlan: fromPlan,
                sourceApprovals: approvalsPath,
                sourcePolicy: engine.POLICY_EVALUATION_RELATIVE_PATH,
                byTaskId: Object.fromEntries(tasks.map((task) => [task.id, task]))
            }
        };
    }
    return normalizeApplyPlanArtifact(payload);
};
const loadPolicyEvaluationArtifact = (cwd) => {
    const policyPath = path.resolve(cwd, engine.POLICY_EVALUATION_RELATIVE_PATH);
    let payload;
    try {
        const rawText = fs.readFileSync(policyPath, 'utf8');
        payload = JSON.parse(rawText);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to read policy evaluation artifact at ${policyPath}: ${message}. Run \`pnpm playbook policy evaluate --json\` first.`);
    }
    const normalizedPayload = payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload
        ? payload.data
        : payload;
    const evaluations = normalizedPayload?.evaluations;
    if (!Array.isArray(evaluations)) {
        throw new Error(`Invalid policy evaluation artifact at ${policyPath}: expected \`evaluations\` array. Run \`pnpm playbook policy evaluate --json\` to regenerate.`);
    }
    return evaluations.map((entry) => {
        if (!entry || typeof entry !== 'object') {
            throw new Error(`Invalid policy evaluation artifact at ${policyPath}: evaluations must contain objects.`);
        }
        const proposalId = entry.proposal_id;
        const decision = entry.decision;
        const reason = entry.reason;
        if (typeof proposalId !== 'string' || typeof reason !== 'string') {
            throw new Error(`Invalid policy evaluation artifact at ${policyPath}: each evaluation must include string proposal_id and reason.`);
        }
        if (decision !== 'safe' && decision !== 'requires_review' && decision !== 'blocked') {
            throw new Error(`Invalid policy evaluation artifact at ${policyPath}: unsupported decision \`${String(decision)}\` for proposal ${proposalId}.`);
        }
        return {
            proposal_id: proposalId,
            decision,
            reason
        };
    });
};
const byProposalId = (left, right) => left.proposal_id.localeCompare(right.proposal_id);
export const validatePolicyApplyResultArtifact = (artifact) => {
    const errors = [];
    if (artifact.schemaVersion !== '1.0') {
        errors.push('schemaVersion must be "1.0"');
    }
    if (artifact.kind !== 'policy-apply-result') {
        errors.push('kind must be "policy-apply-result"');
    }
    const validateEntry = (entry, field) => {
        if (typeof entry.proposal_id !== 'string' || entry.proposal_id.length === 0) {
            errors.push(`${field}[].proposal_id must be a non-empty string`);
        }
        if (!['safe', 'requires_review', 'blocked'].includes(entry.decision)) {
            errors.push(`${field}[].decision must be one of safe, requires_review, blocked`);
        }
        if (typeof entry.reason !== 'string' || entry.reason.length === 0) {
            errors.push(`${field}[].reason must be a non-empty string`);
        }
    };
    for (const [field, list] of [
        ['executed', artifact.executed],
        ['skipped_requires_review', artifact.skipped_requires_review],
        ['skipped_blocked', artifact.skipped_blocked]
    ]) {
        if (!Array.isArray(list)) {
            errors.push(`${field} must be an array`);
            continue;
        }
        for (const entry of list) {
            validateEntry(entry, field);
        }
        const sortedIds = [...list].map((entry) => entry.proposal_id).sort((left, right) => left.localeCompare(right));
        const currentIds = list.map((entry) => entry.proposal_id);
        if (sortedIds.join('\u0000') !== currentIds.join('\u0000')) {
            errors.push(`${field} must be deterministically ordered by proposal_id`);
        }
    }
    if (!Array.isArray(artifact.failed_execution)) {
        errors.push('failed_execution must be an array');
    }
    else {
        for (const entry of artifact.failed_execution) {
            validateEntry(entry, 'failed_execution');
            if (typeof entry.error !== 'string' || entry.error.length === 0) {
                errors.push('failed_execution[].error must be a non-empty string');
            }
        }
        const sortedIds = [...artifact.failed_execution].map((entry) => entry.proposal_id).sort((left, right) => left.localeCompare(right));
        const currentIds = artifact.failed_execution.map((entry) => entry.proposal_id);
        if (sortedIds.join('\u0000') !== currentIds.join('\u0000')) {
            errors.push('failed_execution must be deterministically ordered by proposal_id');
        }
    }
    if (!artifact.summary || typeof artifact.summary !== 'object') {
        errors.push('summary must be an object');
    }
    else {
        const summary = artifact.summary;
        for (const field of ['executed', 'skipped_requires_review', 'skipped_blocked', 'failed_execution', 'total']) {
            const value = summary[field];
            if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
                errors.push(`summary.${field} must be a non-negative integer`);
            }
        }
    }
    return errors;
};
const executeSafePolicyProposal = (cwd, proposal) => {
    const candidatesPath = path.resolve(cwd, '.playbook/improvement-candidates.json');
    let payload;
    try {
        payload = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Unable to read improvement candidates at ${candidatesPath}: ${message}. Run \`pnpm playbook improve --json\` first.`;
    }
    const normalizedPayload = payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload
        ? payload.data
        : payload;
    const candidates = normalizedPayload?.candidates;
    if (!Array.isArray(candidates)) {
        return `Invalid improvement candidates artifact at ${candidatesPath}: expected \`candidates\` array.`;
    }
    const exists = candidates.some((candidate) => {
        if (!candidate || typeof candidate !== 'object') {
            return false;
        }
        return candidate.candidate_id === proposal.proposal_id;
    });
    if (!exists) {
        return `No deterministic execution target found for safe proposal \`${proposal.proposal_id}\` in ${candidatesPath}.`;
    }
    return null;
};
const runPolicyApply = (cwd) => {
    const preflight = engine.buildPolicyPreflight(loadPolicyEvaluationArtifact(cwd));
    const executed = [];
    const failedExecution = [];
    for (const safeProposal of preflight.eligible) {
        const executionError = executeSafePolicyProposal(cwd, safeProposal);
        if (executionError) {
            failedExecution.push({ ...safeProposal, error: executionError });
            continue;
        }
        executed.push(safeProposal);
    }
    const deterministicExecuted = [...executed].sort(byProposalId);
    const deterministicSkippedRequiresReview = [...preflight.requires_review].sort(byProposalId);
    const deterministicSkippedBlocked = [...preflight.blocked].sort(byProposalId);
    const deterministicFailedExecution = [...failedExecution].sort(byProposalId);
    const resultArtifact = {
        schemaVersion: '1.0',
        kind: 'policy-apply-result',
        executed: deterministicExecuted,
        skipped_requires_review: deterministicSkippedRequiresReview,
        skipped_blocked: deterministicSkippedBlocked,
        failed_execution: deterministicFailedExecution,
        summary: {
            executed: deterministicExecuted.length,
            skipped_requires_review: deterministicSkippedRequiresReview.length,
            skipped_blocked: deterministicSkippedBlocked.length,
            failed_execution: deterministicFailedExecution.length,
            total: preflight.summary.total
        }
    };
    const validationErrors = validatePolicyApplyResultArtifact(resultArtifact);
    if (validationErrors.length > 0) {
        warn(`playbook apply --policy: warning: policy-apply-result artifact failed schema validation: ${validationErrors.join('; ')}`);
    }
    const resultArtifactPath = path.resolve(cwd, POLICY_APPLY_RESULT_RELATIVE_PATH);
    writeJsonArtifactAbsolute(resultArtifactPath, resultArtifact, 'apply', { envelope: false });
    const exitCode = deterministicFailedExecution.length > 0 ? ExitCode.Failure : ExitCode.Success;
    return {
        ...resultArtifact,
        schemaVersion: '1.0',
        command: 'apply',
        mode: 'policy',
        ok: exitCode === ExitCode.Success,
        exitCode,
        resultArtifact: POLICY_APPLY_RESULT_RELATIVE_PATH
    };
};
const selectPlanTasks = (tasks, selectedTaskIds) => {
    if (!selectedTaskIds) {
        return tasks;
    }
    const normalizedIds = selectedTaskIds.filter((id) => id.trim().length > 0);
    const uniqueIds = [...new Set(normalizedIds)];
    if (uniqueIds.length === 0) {
        throw new Error('No task ids were provided. Supply at least one --task <task-id>.');
    }
    const availableTaskIds = new Set(tasks.map((task) => task.id));
    const unknownTaskIds = uniqueIds.filter((id) => !availableTaskIds.has(id));
    if (unknownTaskIds.length > 0) {
        throw new Error(`Unknown task id(s): ${unknownTaskIds.join(', ')}.`);
    }
    const selectedTaskIdsSet = new Set(uniqueIds);
    return tasks.filter((task) => selectedTaskIdsSet.has(task.id));
};
const renderTextApply = (result) => {
    console.log('Apply');
    console.log('────────');
    console.log('');
    console.log(`Applied: ${result.summary.applied}`);
    console.log(`Skipped: ${result.summary.skipped}`);
    console.log(`Unsupported: ${result.summary.unsupported}`);
    console.log(`Failed: ${result.summary.failed}`);
    console.log('');
    if (result.results.length === 0) {
        console.log('(none)');
        return;
    }
    for (const entry of result.results) {
        const target = entry.file ?? '(no file)';
        console.log(`${entry.id} ${entry.ruleId} ${entry.status} ${target}`);
    }
};
const renderTextPolicyCheck = (result) => {
    console.log('Apply policy preflight (read-only)');
    console.log('────────────────────────────────');
    console.log(`Eligible: ${result.summary.eligible}`);
    console.log(`Requires review: ${result.summary.requires_review}`);
    console.log(`Blocked: ${result.summary.blocked}`);
    console.log(`Total: ${result.summary.total}`);
    const printGroup = (title, entries) => {
        console.log('');
        console.log(`${title}:`);
        if (entries.length === 0) {
            console.log('  (none)');
            return;
        }
        for (const entry of entries) {
            console.log(`  - ${entry.proposal_id}: ${entry.reason}`);
        }
    };
    printGroup('eligible', result.eligible);
    printGroup('requires_review', result.requires_review);
    printGroup('blocked', result.blocked);
};
const printApplyHelp = () => {
    console.log('Usage: playbook apply [options]');
    console.log('');
    console.log('Execute deterministic auto-fixable plan tasks from generated or saved plan artifacts.');
    console.log('');
    console.log('Options:');
    console.log('  --policy-check             Read-only preflight of policy-evaluated proposal eligibility');
    console.log('  --policy                   Controlled policy-gated execution for safe proposals only');
    console.log('  --from-plan <path>         Apply tasks from a previously saved `playbook plan --json` artifact');
    console.log(`  --maintenance-approvals <path>  Approval artifact for maintenance-plan execution (default: ${engine.MAINTENANCE_APPROVALS_RELATIVE_PATH})`);
    console.log('  --task <id>                Apply only selected task ID (repeatable; requires --from-plan)');
    console.log('  --json                     Alias for --format=json');
    console.log('  --format <text|json>       Output format');
    console.log('  --quiet                    Suppress success output in text mode');
    console.log('  --help                     Show help');
};
const resolveApplyMode = (options) => {
    if (options.policyCheck) {
        return 'policy-check';
    }
    if (options.policy) {
        return 'policy';
    }
    return 'standard';
};
const validateApplyOptions = (options, mode) => {
    if (mode === 'policy-check') {
        if (options.policy) {
            throw new Error('The --policy flag cannot be combined with --policy-check.');
        }
        if (options.fromPlan) {
            throw new Error('The --policy-check flag is read-only and cannot be combined with --from-plan.');
        }
        if ((options.tasks?.length ?? 0) > 0) {
            throw new Error('The --policy-check flag is read-only and cannot be combined with --task.');
        }
    }
    if (mode === 'policy') {
        if (options.fromPlan) {
            throw new Error('The --policy flag cannot be combined with --from-plan.');
        }
        if ((options.tasks?.length ?? 0) > 0) {
            throw new Error('The --policy flag cannot be combined with --task.');
        }
    }
    if (mode === 'standard' && (options.tasks?.length ?? 0) > 0 && !options.fromPlan) {
        throw new Error('The --task flag requires --from-plan so task selection is tied to a reviewed artifact.');
    }
};
const emitApplyOutput = (options, payload, renderText) => {
    if (options.format === 'json') {
        console.log(JSON.stringify(payload, null, 2));
        return payload.exitCode;
    }
    if (!options.quiet) {
        renderText(payload);
    }
    return payload.exitCode;
};
const emitPolicyCheckOutput = (options, payload) => {
    if (options.format === 'json') {
        console.log(JSON.stringify(payload, null, 2));
        return ExitCode.Success;
    }
    if (!options.quiet) {
        renderTextPolicyCheck(payload);
    }
    return ExitCode.Success;
};
const emitPolicyApplyOutput = (options, payload) => {
    if (options.format === 'json') {
        console.log(JSON.stringify(payload, null, 2));
        return payload.exitCode;
    }
    if (!options.quiet) {
        console.log('Apply policy execution (safe proposals only)');
        console.log('──────────────────────────────────────────');
        console.log(`Executed: ${payload.summary.executed}`);
        console.log(`Skipped (requires_review): ${payload.summary.skipped_requires_review}`);
        console.log(`Skipped (blocked): ${payload.summary.skipped_blocked}`);
        console.log(`Failed execution: ${payload.summary.failed_execution}`);
        console.log(`Result artifact: ${payload.resultArtifact}`);
    }
    return payload.exitCode;
};
const attachApplyRunArtifacts = (cwd, runId, fromPlan) => {
    const runArtifactPath = engine.executionRunPath(cwd, runId);
    engine.attachSessionRunState(cwd, {
        step: 'apply',
        runId,
        goal: 'apply deterministic remediation plan',
        artifacts: [
            { artifact: runArtifactPath, kind: 'run' },
            ...(fromPlan ? [{ artifact: fromPlan, kind: 'plan' }] : [])
        ]
    });
};
const attachPolicyArtifactsToSession = (cwd) => {
    const artifacts = [
        '.playbook/improvement-candidates.json',
        '.playbook/policy-evaluation.json',
        '.playbook/policy-apply-result.json'
    ];
    for (const artifact of artifacts) {
        if (fs.existsSync(path.resolve(cwd, artifact))) {
            engine.pinSessionArtifact(cwd, artifact, 'artifact');
        }
    }
    engine.updateSession(cwd, { currentStep: 'apply' });
};
const runPolicyCheckFlow = (cwd, options) => {
    const evaluations = loadPolicyEvaluationArtifact(cwd);
    const preflight = engine.buildPolicyPreflight(evaluations);
    const payload = {
        ...preflight,
        command: 'apply',
        mode: 'policy-check',
        ok: true,
        exitCode: ExitCode.Success
    };
    attachPolicyArtifactsToSession(cwd);
    return emitPolicyCheckOutput(options, payload);
};
const runPolicyApplyFlow = (cwd, options) => {
    const payload = runPolicyApply(cwd);
    attachPolicyArtifactsToSession(cwd);
    return emitPolicyApplyOutput(options, payload);
};
const shouldRunReleaseSyncBoundary = (cwd) => {
    const versionPolicyPath = path.resolve(cwd, '.playbook', 'version-policy.json');
    if (fs.existsSync(versionPolicyPath)) {
        return true;
    }
    const packageJsonPath = path.resolve(cwd, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        return true;
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        return parsed.name === 'playbook-monorepo';
    }
    catch {
        return false;
    }
};
const applyReleaseSyncCommitBoundary = (cwd) => {
    if (!shouldRunReleaseSyncBoundary(cwd)) {
        return { status: 'skipped' };
    }
    const initialAssessment = engine.assessReleaseSync(cwd, { mode: 'check' });
    const reconciliation = engine.classifyReleaseSyncReconciliation(initialAssessment);
    if (reconciliation.status === 'no_drift') {
        return { status: 'no_drift' };
    }
    if (reconciliation.status === 'blocked_drift') {
        throw new Error(`playbook apply: release-governed drift is blocked and cannot be auto-fixed in apply boundary (${reconciliation.reason}). Run \`pnpm playbook release sync --check\` for details.`);
    }
    execSync('pnpm playbook release sync --json --out .playbook/release-plan.json', { cwd, stdio: 'inherit' });
    const finalAssessment = engine.assessReleaseSync(cwd, { mode: 'check' });
    const finalReconciliation = engine.classifyReleaseSyncReconciliation(finalAssessment);
    if (finalReconciliation.status !== 'no_drift') {
        throw new Error('playbook apply: release sync did not converge to a release-clean state.');
    }
    const versionLabel = reconciliation.plannedVersions.length > 0 ? reconciliation.plannedVersions.join(', ') : initialAssessment.plan.summary.recommendedBump;
    return {
        status: 'auto_applied',
        note: `Release governance auto-applied (${reconciliation.taskCount} task${reconciliation.taskCount === 1 ? '' : 's'}, planned version ${versionLabel}).`
    };
};
const resolveRunId = (cwd, requestedRunId) => {
    if (requestedRunId) {
        return requestedRunId;
    }
    const latest = engine.getLatestMutableRun ? engine.getLatestMutableRun(cwd) : null;
    if (latest) {
        return latest.id;
    }
    const intent = engine.createExecutionIntent('apply deterministic remediation plan', ['plan', 'apply', 'verify'], ['approved-plan-required'], 'user');
    return engine.createExecutionRun(cwd, intent).id;
};
export const runApply = async (cwd, options) => {
    if (options.help) {
        printApplyHelp();
        return ExitCode.Success;
    }
    const mode = resolveApplyMode(options);
    validateApplyOptions(options, mode);
    if (mode === 'policy-check') {
        return runPolicyCheckFlow(cwd, options);
    }
    if (mode === 'policy') {
        return runPolicyApplyFlow(cwd, options);
    }
    const routeDecision = engine.routeTask(cwd, 'apply approved remediation plan', {
        taskKind: 'patch_execution',
        hasApprovedPlan: true,
        safetyConstraints: { allowRepositoryMutation: true, requiresApprovedPlan: true }
    });
    if (routeDecision.route === 'unsupported') {
        throw new Error(`Cannot execute apply flow: ${routeDecision.why}`);
    }
    const runId = resolveRunId(cwd, options.runId);
    const plan = options.fromPlan
        ? loadPlanFromFile(cwd, options.fromPlan, options)
        : (() => {
            const generatedPlan = engine.generatePlanContract(cwd);
            const verifyPayload = typeof generatedPlan === 'object' && generatedPlan !== null && 'verify' in generatedPlan
                ? generatedPlan.verify ?? null
                : null;
            const tasks = Array.isArray(generatedPlan?.tasks)
                ? generatedPlan.tasks
                : [];
            const failureFacts = deriveVerifyFailureFacts(verifyPayload);
            return {
                tasks,
                remediation: buildPlanRemediation({ failureCount: failureFacts.failureCount, stepCount: tasks.length })
            };
        })();
    const applyPrecondition = remediationToApplyPrecondition(plan.remediation);
    if (applyPrecondition.action === 'fail') {
        throw new Error(`Cannot apply remediation: ${applyPrecondition.message}`);
    }
    if (applyPrecondition.action === 'no_op') {
        const payload = {
            schemaVersion: '1.0',
            command: 'apply',
            ok: true,
            exitCode: ExitCode.Success,
            remediation: plan.remediation,
            message: applyPrecondition.message,
            results: [],
            summary: { applied: 0, skipped: 0, unsupported: 0, failed: 0 }
        };
        engine.appendExecutionStep(cwd, runId, {
            kind: 'apply',
            status: 'skipped',
            inputs: { fromPlan: options.fromPlan ?? null, selectedTaskCount: 0 },
            outputs: payload.summary,
            evidence: options.fromPlan ? [{ id: 'evidence-plan-artifact', kind: 'artifact', ref: options.fromPlan }] : []
        });
        writeCanonicalApplyArtifact(cwd, []);
        attachApplyRunArtifacts(cwd, runId, options.fromPlan);
        const releaseBoundaryResult = options.skipReleaseGovernanceBoundary ? { status: 'skipped' } : applyReleaseSyncCommitBoundary(cwd);
        if (releaseBoundaryResult.status === 'auto_applied') {
            payload.message = payload.message ? `${payload.message} ${releaseBoundaryResult.note}` : releaseBoundaryResult.note;
            if (options.format !== 'json' && !options.quiet) {
                console.log(`playbook apply: ${releaseBoundaryResult.note}`);
            }
        }
        if (options.format === 'json') {
            console.log(JSON.stringify(payload, null, 2));
            return ExitCode.Success;
        }
        if (!options.quiet) {
            console.log(applyPrecondition.message);
        }
        return ExitCode.Success;
    }
    const selectedTasks = selectPlanTasks(plan.tasks, options.tasks);
    if (plan.maintenanceExecution) {
        const outcomes = [];
        for (const selectedTask of selectedTasks) {
            const executionTask = plan.maintenanceExecution.byTaskId[selectedTask.id];
            if (!executionTask) {
                throw new Error(`Missing maintenance execution mapping for task ${selectedTask.id}.`);
            }
            try {
                execSync(executionTask.command, { cwd, stdio: 'pipe' });
                outcomes.push({
                    taskId: executionTask.id,
                    maintenanceId: executionTask.maintenanceId,
                    maintenanceType: executionTask.maintenanceType,
                    command: executionTask.command,
                    status: 'executed',
                    boundedTargetSurface: executionTask.boundedTargetSurface,
                    approvalRef: executionTask.approvalRef,
                    policyRef: executionTask.policyRef,
                    sourceEvidenceRefs: executionTask.sourceEvidenceRefs,
                    exitCode: 0,
                    message: 'maintenance command completed'
                });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                outcomes.push({
                    taskId: executionTask.id,
                    maintenanceId: executionTask.maintenanceId,
                    maintenanceType: executionTask.maintenanceType,
                    command: executionTask.command,
                    status: 'failed',
                    boundedTargetSurface: executionTask.boundedTargetSurface,
                    approvalRef: executionTask.approvalRef,
                    policyRef: executionTask.policyRef,
                    sourceEvidenceRefs: executionTask.sourceEvidenceRefs,
                    exitCode: 1,
                    message
                });
            }
        }
        const { receipt } = engine.writeMaintenanceExecutionArtifacts(cwd, {
            sourcePlan: plan.maintenanceExecution.sourcePlan,
            sourceApprovals: plan.maintenanceExecution.sourceApprovals,
            sourcePolicy: plan.maintenanceExecution.sourcePolicy,
            outcomes
        });
        const executionResults = outcomes.map((entry) => ({
            id: entry.taskId,
            ruleId: 'maintenance.execution',
            file: null,
            action: entry.command,
            autoFix: false,
            status: entry.status === 'executed' ? 'applied' : 'failed',
            message: entry.message,
            details: {
                maintenance_id: entry.maintenanceId,
                maintenance_type: entry.maintenanceType,
                bounded_target_surface: entry.boundedTargetSurface,
                approval_ref: entry.approvalRef,
                policy_ref: entry.policyRef
            }
        }));
        const exitCode = receipt.summary.failed > 0 ? ExitCode.Failure : ExitCode.Success;
        const payload = {
            schemaVersion: '1.0',
            command: 'apply',
            ok: exitCode === ExitCode.Success,
            exitCode,
            remediation: plan.remediation,
            message: 'Executed approval-gated bounded maintenance tasks through apply boundary.',
            results: executionResults,
            summary: {
                applied: receipt.summary.executed,
                skipped: 0,
                unsupported: 0,
                failed: receipt.summary.failed
            }
        };
        writeCanonicalApplyArtifact(cwd, executionResults);
        attachApplyRunArtifacts(cwd, runId, options.fromPlan);
        return emitApplyOutput(options, payload, renderTextApply);
    }
    validateReleaseTaskSelection(plan, selectedTasks);
    const declaredScope = engine.readApplyChangeScope(cwd);
    if (declaredScope) {
        engine.enforceApplyChangeScope(selectedTasks, declaredScope);
    }
    engine.validateRemediationPlan(cwd, selectedTasks);
    const verifyRules = await loadVerifyRules(cwd);
    const handlers = {};
    for (const task of selectedTasks) {
        const pluginRule = verifyRules.find((rule) => rule.id === task.ruleId);
        if (pluginRule?.fix) {
            handlers[task.ruleId] = pluginRule.fix;
        }
    }
    const execution = await engine.applyExecutionPlan(cwd, selectedTasks, { dryRun: false, handlers });
    const exitCode = execution.summary.failed > 0 ? ExitCode.Failure : ExitCode.Success;
    const payload = {
        schemaVersion: '1.0',
        command: 'apply',
        ok: exitCode === ExitCode.Success,
        exitCode,
        remediation: plan.remediation,
        message: applyPrecondition.message,
        results: execution.results,
        summary: execution.summary
    };
    engine.appendExecutionStep(cwd, runId, {
        kind: 'apply',
        status: exitCode === ExitCode.Success ? 'passed' : 'failed',
        inputs: {
            fromPlan: options.fromPlan ?? null,
            selectedTaskCount: selectedTasks.length
        },
        outputs: payload.summary,
        evidence: [
            ...(options.fromPlan ? [{ id: 'evidence-plan-artifact', kind: 'artifact', ref: options.fromPlan }] : []),
            ...execution.results.map((result, index) => ({
                id: `evidence-apply-${String(index + 1).padStart(3, '0')}`,
                kind: 'log',
                ref: `${result.ruleId}:${result.status}`,
                note: result.message
            }))
        ]
    });
    writeCanonicalApplyArtifact(cwd, execution.results);
    attachApplyRunArtifacts(cwd, runId, options.fromPlan);
    if (exitCode === ExitCode.Success) {
        const releaseBoundaryResult = options.skipReleaseGovernanceBoundary ? { status: 'skipped' } : applyReleaseSyncCommitBoundary(cwd);
        if (releaseBoundaryResult.status === 'auto_applied') {
            payload.message = payload.message ? `${payload.message} ${releaseBoundaryResult.note}` : releaseBoundaryResult.note;
            if (options.format !== 'json' && !options.quiet) {
                console.log(`playbook apply: ${releaseBoundaryResult.note}`);
            }
        }
    }
    return emitApplyOutput(options, payload, renderTextApply);
};
//# sourceMappingURL=apply.js.map