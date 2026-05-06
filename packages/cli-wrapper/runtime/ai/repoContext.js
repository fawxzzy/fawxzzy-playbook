import fs from 'node:fs';
import path from 'node:path';
import { buildRiskAwareContextSummary, loadAiContract, resolveContextSnapshotCache } from '@zachariahredfield/playbook-engine';
const REPO_INDEX_PATH = '.playbook/repo-index.json';
const AI_CONTRACT_PATH = '.playbook/ai-contract.json';
const MODULE_DIGESTS_PATH = '.playbook/module-digests.json';
const ensureStringArray = (value) => Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
const toModuleSummary = (modules) => {
    if (!Array.isArray(modules)) {
        return { names: [], edges: [] };
    }
    const names = [];
    const edges = [];
    for (const moduleEntry of modules) {
        if (typeof moduleEntry === 'string') {
            names.push(moduleEntry);
            continue;
        }
        if (!moduleEntry || typeof moduleEntry !== 'object' || Array.isArray(moduleEntry)) {
            continue;
        }
        const record = moduleEntry;
        if (typeof record.name !== 'string') {
            continue;
        }
        names.push(record.name);
        const dependencies = ensureStringArray(record.dependencies);
        for (const dependency of dependencies) {
            edges.push(`${record.name} -> ${dependency}`);
        }
    }
    return {
        names: names.sort((left, right) => left.localeCompare(right)),
        edges: edges.sort((left, right) => left.localeCompare(right))
    };
};
const loadRepoIndex = (cwd) => {
    const indexPath = path.join(cwd, REPO_INDEX_PATH);
    if (!fs.existsSync(indexPath)) {
        throw new Error('Repository context is not available yet.\nRun `playbook index` to generate .playbook/repo-index.json and retry.');
    }
    const payload = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    if (payload.schemaVersion !== '1.0') {
        throw new Error(`Repository context could not be loaded from ${REPO_INDEX_PATH}: unsupported schemaVersion "${String(payload.schemaVersion)}". Expected "1.0".`);
    }
    return payload;
};
const renderAiContractSummary = (contract) => [
    `AI contract runtime: ${contract.ai_runtime}`,
    `AI contract workflow: ${contract.workflow.join(' -> ')}`,
    `AI contract intelligence sources: repoIndex=${contract.intelligence_sources.repoIndex}, moduleOwners=${contract.intelligence_sources.moduleOwners}`,
    `AI contract rule: prefer Playbook commands over ad-hoc inspection = ${contract.rules.preferPlaybookCommandsOverAdHocInspection ? 'true' : 'false'}`
];
const renderRiskAwareSummary = (projectRoot) => {
    const shaped = buildRiskAwareContextSummary(projectRoot);
    if (!shaped) {
        return {
            lines: ['Risk-aware context shaping: unavailable (run `playbook index` to materialize .playbook/module-digests.json).']
        };
    }
    return {
        source: MODULE_DIGESTS_PATH,
        lines: [
            `Risk-aware context shaping: high-risk=${shaped.highRiskModules}, low-risk=${shaped.lowRiskModules}`,
            `Risk-aware depth map: high=${shaped.defaultDepthByTier.high}, low=${shaped.defaultDepthByTier.low}`,
            `Risk-aware provenance: ${shaped.provenanceRefs.join(', ')}`
        ]
    };
};
const renderRepoIndexSummary = (repoIndex) => {
    const modules = toModuleSummary(repoIndex.modules);
    const rules = ensureStringArray(repoIndex.rules);
    const sections = [
        `Repository architecture: ${typeof repoIndex.architecture === 'string' ? repoIndex.architecture : 'unknown'}`,
        `Repository framework: ${typeof repoIndex.framework === 'string' ? repoIndex.framework : 'unknown'}`,
        `Repository language: ${typeof repoIndex.language === 'string' ? repoIndex.language : 'unknown'}`,
        `Repository modules (${modules.names.length}): ${modules.names.length > 0 ? modules.names.join(', ') : 'none'}`,
        `Repository module dependencies (${modules.edges.length}): ${modules.edges.length > 0 ? modules.edges.join('; ') : 'none'}`,
        `Repository rule registry (${rules.length}): ${rules.length > 0 ? rules.join(', ') : 'none'}`
    ];
    return sections;
};
export const loadAskRepoContext = (options) => {
    if (!options.enabled) {
        return {
            enabled: false,
            sources: [],
            promptContext: ''
        };
    }
    const cached = resolveContextSnapshotCache({
        projectRoot: options.cwd,
        scope: { kind: 'repo', id: 'root' },
        shapingLevel: 'ask-repo-context',
        riskTier: 'repo-context',
        sourceArtifacts: ['.playbook/repo-index.json', '.playbook/repo-graph.json', '.playbook/module-digests.json', '.playbook/runtime-manifests.json', '.playbook/ai-contract.json'],
        buildSnapshot: () => {
            const repoIndex = loadRepoIndex(options.cwd);
            const contract = loadAiContract(options.cwd);
            const riskAware = renderRiskAwareSummary(options.cwd);
            const promptContext = [
                'Trusted repository context:',
                ...renderRepoIndexSummary(repoIndex),
                ...renderAiContractSummary(contract.contract),
                ...riskAware.lines,
                `AI contract source: ${contract.source === 'file' ? AI_CONTRACT_PATH : 'generated fallback (run `playbook ai-contract --json` to inspect/commit explicit contract)'}`,
                'End trusted repository context.'
            ].join('\n');
            return {
                sources: [REPO_INDEX_PATH, contract.source === 'file' ? AI_CONTRACT_PATH : 'generated-ai-contract-fallback', ...(riskAware.source ? [riskAware.source] : [])],
                promptContext
            };
        }
    });
    return {
        enabled: true,
        sources: cached.snapshot.sources,
        promptContext: cached.snapshot.promptContext,
        cacheLifecycle: cached.cache
    };
};
//# sourceMappingURL=repoContext.js.map