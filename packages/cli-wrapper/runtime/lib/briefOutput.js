const formatList = (items, fallback = 'none') => {
    if (!items || items.length === 0) {
        return fallback;
    }
    return items.join('; ');
};
export const renderBriefOutput = (input) => {
    const lines = [input.title, '─'.repeat(input.title.length), `Decision: ${input.decision}`];
    if (input.status) {
        lines.push(`Status: ${input.status}`);
    }
    if (input.why) {
        lines.push(`Why: ${input.why}`);
    }
    lines.push(`Affected surfaces: ${formatList(input.affectedSurfaces)}`);
    lines.push(`Blockers: ${formatList(input.blockers)}`);
    lines.push(`Next action: ${input.nextAction}`);
    if (input.artifactRefs && input.artifactRefs.length > 0) {
        lines.push(`Artifacts: ${input.artifactRefs.join(', ')}`);
    }
    for (const section of input.extraSections ?? []) {
        if (section.items.length === 0) {
            continue;
        }
        lines.push('', `${section.label}:`);
        for (const item of section.items) {
            lines.push(`- ${item}`);
        }
    }
    return lines.join('\n');
};
//# sourceMappingURL=briefOutput.js.map