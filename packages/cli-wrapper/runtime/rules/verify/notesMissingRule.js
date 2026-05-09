export const notesMissingRule = {
    id: 'notes.missing',
    description: 'Require docs/PLAYBOOK_NOTES.md so governance changes are recorded.',
    check: ({ failure }) => failure.id === 'notes.missing',
    policy: {
        id: 'notes.missing',
        description: 'Require a non-empty Playbook notes document.'
    },
    explanation: 'Playbook tracks reusable patterns and failures in docs/PLAYBOOK_NOTES.md so future changes are easier to understand and audit.',
    remediation: ['Create docs/PLAYBOOK_NOTES.md.', 'Add at least one entry describing what changed and why.']
};
//# sourceMappingURL=notesMissingRule.js.map