export const runVerifyRule = {
    id: 'analyze-run-verify',
    description: 'Recommend running verify after analyze before opening a PR.',
    check: ({ recommendation }) => recommendation.id === 'analyze-run-verify'
};
//# sourceMappingURL=runVerifyRule.js.map