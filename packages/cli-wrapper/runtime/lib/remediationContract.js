const isObject = (value) => typeof value === 'object' && value !== null;
const getInteger = (value) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        return undefined;
    }
    return value;
};
const isFailureLevelFinding = (finding) => {
    if (!isObject(finding)) {
        return false;
    }
    const level = finding.level;
    if (typeof level !== 'string') {
        return false;
    }
    const normalizedLevel = level.toLowerCase();
    return normalizedLevel === 'failure' || normalizedLevel === 'error';
};
export const deriveVerifyFailureFacts = (verifyPayload) => {
    if (!isObject(verifyPayload)) {
        return { failureCount: 0, sources: [] };
    }
    const candidates = [];
    const sources = [];
    const failures = verifyPayload.failures;
    if (Array.isArray(failures)) {
        candidates.push(failures.length);
        sources.push('failures.length');
    }
    const findings = verifyPayload.findings;
    if (Array.isArray(findings)) {
        candidates.push(findings.filter(isFailureLevelFinding).length);
        sources.push('findings[level=failure|error].length');
    }
    const summary = verifyPayload.summary;
    if (isObject(summary)) {
        const summaryFailures = getInteger(summary.failures);
        if (summaryFailures !== undefined) {
            candidates.push(summaryFailures);
            sources.push('summary.failures');
        }
    }
    return {
        failureCount: candidates.length > 0 ? Math.max(...candidates) : 0,
        sources
    };
};
export const buildPlanRemediation = ({ failureCount, stepCount, unresolvedFailureCount, unavailableReason }) => {
    if (failureCount === 0) {
        return {
            status: 'not_needed',
            totalSteps: stepCount,
            unresolvedFailures: 0,
            reason: 'No verify failures were detected.'
        };
    }
    if (stepCount === 0) {
        return {
            status: 'unavailable',
            totalSteps: stepCount,
            unresolvedFailures: unresolvedFailureCount ?? failureCount,
            reason: unavailableReason ?? 'Verify failures were detected but no remediation tasks are currently available.'
        };
    }
    return {
        status: 'ready',
        totalSteps: stepCount,
        unresolvedFailures: unresolvedFailureCount ?? Math.max(0, failureCount - stepCount)
    };
};
export const parsePlanRemediation = (value) => {
    if (!isObject(value)) {
        throw new Error('Plan JSON contract is missing remediation object.');
    }
    const status = value.status;
    const totalSteps = value.totalSteps;
    const unresolvedFailures = value.unresolvedFailures;
    if (status !== 'ready' && status !== 'not_needed' && status !== 'unavailable') {
        throw new Error('Plan JSON contract has invalid remediation.status.');
    }
    if (typeof totalSteps !== 'number' || !Number.isInteger(totalSteps) || totalSteps < 0) {
        throw new Error('Plan JSON contract has invalid remediation.totalSteps.');
    }
    if (typeof unresolvedFailures !== 'number' || !Number.isInteger(unresolvedFailures) || unresolvedFailures < 0) {
        throw new Error('Plan JSON contract has invalid remediation.unresolvedFailures.');
    }
    const reason = value.reason;
    if (reason !== undefined && typeof reason !== 'string') {
        throw new Error('Plan JSON contract has invalid remediation.reason.');
    }
    return {
        status,
        totalSteps,
        unresolvedFailures,
        reason
    };
};
export const remediationToApplyPrecondition = (remediation) => {
    if (remediation.status === 'ready') {
        return {
            action: 'proceed',
            message: 'Plan remediation is ready. Applying available tasks.'
        };
    }
    if (remediation.status === 'not_needed') {
        return {
            action: 'no_op',
            message: remediation.reason ?? 'No remediation is needed. Apply is a no-op.'
        };
    }
    return {
        action: 'fail',
        message: remediation.reason ?? 'Remediation is unavailable for the current verify failures.'
    };
};
//# sourceMappingURL=remediationContract.js.map