export var ExitCode;
(function (ExitCode) {
    ExitCode[ExitCode["Success"] = 0] = "Success";
    ExitCode[ExitCode["Failure"] = 1] = "Failure";
    ExitCode[ExitCode["EnvironmentPrereq"] = 2] = "EnvironmentPrereq";
    ExitCode[ExitCode["PolicyFailure"] = 3] = "PolicyFailure";
    ExitCode[ExitCode["WarningsOnly"] = 4] = "WarningsOnly";
})(ExitCode || (ExitCode = {}));
const compareFindings = (left, right) => {
    const levelOrder = ['error', 'warning', 'info'];
    const levelDiff = levelOrder.indexOf(left.level) - levelOrder.indexOf(right.level);
    if (levelDiff !== 0) {
        return levelDiff;
    }
    const idDiff = left.id.localeCompare(right.id);
    if (idDiff !== 0) {
        return idDiff;
    }
    return left.message.localeCompare(right.message);
};
export const sortFindings = (findings) => [...findings].sort(compareFindings);
export const sortNextActions = (nextActions) => [...nextActions].sort((a, b) => a.localeCompare(b));
export const buildResult = ({ findings = [], nextActions = [], ...rest }) => ({
    schemaVersion: '1.0',
    ...rest,
    findings: sortFindings(findings),
    nextActions: sortNextActions(nextActions)
});
export const emitResult = ({ format, quiet = false, explain = false, ...rest }) => {
    const result = buildResult(rest);
    if (format === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (quiet && result.ok) {
        return;
    }
    console.log(result.summary);
    if (result.findings.length > 0) {
        for (const finding of result.findings) {
            const prefix = finding.level === 'error' ? '✖' : finding.level === 'warning' ? '⚠' : '•';
            console.log(`${prefix} [${finding.id}] ${finding.message}`);
            if (explain) {
                if (finding.explanation) {
                    console.log('  Why this matters:');
                    console.log(`  ${finding.explanation}`);
                }
                if (finding.remediation && finding.remediation.length > 0) {
                    console.log('  How to fix:');
                    for (const step of finding.remediation) {
                        console.log(`  - ${step}`);
                    }
                }
            }
        }
    }
    if (result.nextActions.length > 0) {
        console.log('Next actions:');
        for (const action of result.nextActions) {
            console.log(`- ${action}`);
        }
    }
};
//# sourceMappingURL=cliContract.js.map