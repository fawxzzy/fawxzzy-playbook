export const runInitRule = {
    id: 'analyze-run-init',
    description: 'Recommend initializing governance docs for repositories missing a baseline.',
    check: ({ recommendation }) => recommendation.id === 'analyze-run-init'
};
//# sourceMappingURL=runInitRule.js.map