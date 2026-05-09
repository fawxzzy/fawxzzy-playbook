export const responseModes = {
    normal: {
        description: 'Full explanation with context',
        instruction: 'Respond with complete explanations, contextual details, and clear reasoning.'
    },
    concise: {
        description: 'Compressed but still complete answers',
        instruction: 'Respond concisely. Keep answers technically complete but compressed for fast skimming. Prefer short paragraphs or bullet points. Avoid filler text.'
    },
    ultra: {
        description: 'Maximum compression, bullet points prioritized',
        instruction: 'Respond in ultra concise format. Rules: bullet points preferred; prioritize actionable information; skip explanations unless necessary.'
    }
};
const responseModeValues = Object.keys(responseModes);
export const parseResponseMode = (value) => {
    if (!value || value.trim().length === 0) {
        return 'normal';
    }
    const normalized = value.trim().toLowerCase();
    if (responseModeValues.includes(normalized)) {
        return normalized;
    }
    throw new Error(`Invalid --mode value "${value}". Allowed values: ${responseModeValues.join(', ')}.`);
};
export const getResponseModeInstruction = (mode) => responseModes[mode].instruction;
//# sourceMappingURL=responseModes.js.map