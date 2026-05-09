import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJsonArtifactAbsolute } from './jsonArtifact.js';
const canonicalize = (value) => {
    if (Array.isArray(value))
        return value.map((entry) => canonicalize(entry));
    if (value && typeof value === 'object') {
        const normalized = {};
        for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
            const entry = canonicalize(value[key]);
            if (entry !== undefined)
                normalized[key] = entry;
        }
        return normalized;
    }
    if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol')
        return undefined;
    return value;
};
const stableSerialize = (value) => JSON.stringify(canonicalize(value));
const stableStringify = (value) => `${JSON.stringify(canonicalize(value), null, 2)}\n`;
const fingerprintOf = (value) => createHash('sha256').update(stableSerialize(value), 'utf8').digest('hex');
const promoteWorkflowArtifact = (stagedPath, destinationPath) => {
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-workflow-promotion-'));
    const backupPath = path.join(backupRoot, 'artifact-backup.json');
    const destinationExisted = fs.existsSync(destinationPath);
    try {
        if (destinationExisted)
            fs.copyFileSync(destinationPath, backupPath);
        fs.copyFileSync(stagedPath, destinationPath);
    }
    catch (error) {
        if (destinationExisted && fs.existsSync(backupPath))
            fs.copyFileSync(backupPath, destinationPath);
        else
            fs.rmSync(destinationPath, { force: true });
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`failed promoting staged workflow artifact; committed state restored. ${message}`);
    }
    finally {
        fs.rmSync(backupRoot, { recursive: true, force: true });
    }
};
const buildWorkflowPromotionResult = (input) => {
    const blockedReason = input.validationErrors.length > 0 ? input.validationErrors.join('; ') : null;
    const promoted = input.validationErrors.length === 0;
    return {
        schemaVersion: '1.0',
        kind: 'workflow-promotion',
        workflow_kind: input.workflowKind,
        staged_generation: true,
        candidate_artifact_path: input.candidateRelativePath,
        staged_artifact_path: input.candidateRelativePath,
        committed_target_path: input.committedRelativePath,
        validation_status: promoted ? 'passed' : 'blocked',
        validation_passed: promoted,
        promotion_status: promoted ? 'promoted' : 'blocked',
        promoted,
        committed_state_preserved: true,
        blocked_reason: blockedReason,
        error_summary: blockedReason,
        generated_at: input.generatedAt ?? new Date(0).toISOString(),
        summary: promoted ? input.successSummary : input.blockedSummary ?? `Staged ${input.workflowKind} candidate blocked before promotion.`
    };
};
const PROMOTION_RECEIPT_LOG_RELATIVE_PATH = '.playbook/promotion-receipts.json';
const readReceiptLog = (cwd) => {
    const targetPath = path.join(cwd, PROMOTION_RECEIPT_LOG_RELATIVE_PATH);
    if (!fs.existsSync(targetPath)) {
        return { schemaVersion: '1.0', kind: 'promotion-receipt-log', receipts: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    return {
        schemaVersion: '1.0',
        kind: 'promotion-receipt-log',
        receipts: Array.isArray(parsed.receipts) ? [...parsed.receipts] : []
    };
};
const workflowKindPrecedence = {
    'promote-story': 10,
    'promote-pattern': 20,
    'promote-pattern-retire': 30,
    'promote-pattern-demote': 40,
    'promote-pattern-recall': 50,
    'promote-pattern-supersede': 60
};
const outcomePrecedence = {
    promoted: 10,
    noop: 20,
    conflict: 30
};
const sortReceipts = (receipts) => [...receipts].sort((left, right) => left.promotion_kind.localeCompare(right.promotion_kind) ||
    left.target_artifact_path.localeCompare(right.target_artifact_path) ||
    left.target_id.localeCompare(right.target_id) ||
    (workflowKindPrecedence[left.workflow_kind] ?? Number.MAX_SAFE_INTEGER) - (workflowKindPrecedence[right.workflow_kind] ?? Number.MAX_SAFE_INTEGER) ||
    (outcomePrecedence[left.outcome] ?? Number.MAX_SAFE_INTEGER) - (outcomePrecedence[right.outcome] ?? Number.MAX_SAFE_INTEGER) ||
    left.generated_at.localeCompare(right.generated_at) ||
    left.source_ref.localeCompare(right.source_ref) ||
    left.receipt_id.localeCompare(right.receipt_id));
export const emitPromotionReceipt = (input) => {
    const generatedAt = input.generatedAt ?? new Date(0).toISOString();
    const receiptBase = {
        schemaVersion: '1.0',
        kind: 'promotion-receipt',
        promotion_kind: input.promotionKind,
        workflow_kind: input.workflowKind,
        generated_at: generatedAt,
        source_ref: input.sourceRef,
        source_fingerprint: input.sourceFingerprint,
        target_artifact_path: input.targetArtifactPath,
        target_id: input.targetId,
        before_fingerprint: input.beforeFingerprint,
        after_fingerprint: input.afterFingerprint,
        outcome: input.outcome,
        committed: input.outcome === 'promoted',
        committed_state_preserved: input.outcome !== 'promoted',
        summary: input.summary,
        conflict_reason: input.conflictReason ?? null
    };
    const receipt = {
        ...receiptBase,
        receipt_id: `promotion-receipt:${fingerprintOf(receiptBase).slice(0, 16)}`
    };
    const log = readReceiptLog(input.cwd);
    const nextLog = {
        schemaVersion: '1.0',
        kind: 'promotion-receipt-log',
        receipts: sortReceipts([...log.receipts.filter((entry) => entry.receipt_id !== receipt.receipt_id), receipt])
    };
    writeJsonArtifactAbsolute(path.join(input.cwd, PROMOTION_RECEIPT_LOG_RELATIVE_PATH), nextLog, 'promote', { envelope: false });
    return receipt;
};
export const previewWorkflowArtifact = (input) => buildWorkflowPromotionResult({
    workflowKind: input.workflowKind,
    candidateRelativePath: input.candidateRelativePath,
    committedRelativePath: input.committedRelativePath,
    generatedAt: input.generatedAt,
    validationErrors: input.validate(),
    successSummary: input.successSummary,
    blockedSummary: input.blockedSummary
});
export const stageWorkflowArtifact = (input) => {
    const stagedPath = path.join(input.cwd, input.candidateRelativePath);
    const committedPath = path.join(input.cwd, input.committedRelativePath);
    fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
    fs.writeFileSync(stagedPath, stableStringify(input.artifact), 'utf8');
    const promotion = previewWorkflowArtifact(input);
    if (!promotion.promoted)
        return promotion;
    promoteWorkflowArtifact(stagedPath, committedPath);
    return promotion;
};
//# sourceMappingURL=workflowPromotion.js.map