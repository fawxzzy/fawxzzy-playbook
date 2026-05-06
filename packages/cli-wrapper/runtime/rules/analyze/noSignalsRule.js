export const noSignalsRule = {
    id: 'analyze-no-signals',
    description: 'Warn when no framework or database stack signals are detected.',
    check: ({ recommendation }) => recommendation.id === 'analyze-no-signals'
};
//# sourceMappingURL=noSignalsRule.js.map