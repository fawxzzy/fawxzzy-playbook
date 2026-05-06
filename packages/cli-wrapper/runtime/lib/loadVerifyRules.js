import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { notesEmptyRule } from '../rules/verify/notesEmptyRule.js';
import { notesMissingRule } from '../rules/verify/notesMissingRule.js';
import { requireNotesOnChangesRule } from '../rules/verify/requireNotesOnChangesRule.js';
import { testsRequiredRule } from '../rules/verify/testsRequiredRule.js';
import { protectedDocGovernanceRule } from '../rules/verify/protectedDocGovernanceRule.js';
import { releaseVersionGovernanceRule } from '../rules/verify/releaseVersionGovernanceRule.js';
export const coreVerifyRules = [notesMissingRule, notesEmptyRule, requireNotesOnChangesRule, testsRequiredRule, protectedDocGovernanceRule, releaseVersionGovernanceRule];
const readDependencyNames = (cwd) => {
    const packageJsonPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        return [];
    }
    const raw = fs.readFileSync(packageJsonPath, 'utf8');
    const pkg = JSON.parse(raw);
    const names = [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
        ...Object.keys(pkg.optionalDependencies ?? {}),
        ...Object.keys(pkg.peerDependencies ?? {})
    ];
    return [...new Set(names)].filter((name) => /^playbook-plugin-/.test(name));
};
const toVerifyRule = (rule) => {
    if (!rule || typeof rule.id !== 'string' || typeof rule.description !== 'string' || typeof rule.verify !== 'function') {
        return undefined;
    }
    return {
        id: rule.id,
        description: rule.description,
        check: rule.verify,
        policy: rule.policy,
        fix: rule.fix,
        explanation: rule.explanation,
        remediation: rule.remediation
    };
};
const loadPluginRules = async (cwd) => {
    const pluginRules = [];
    for (const dependencyName of readDependencyNames(cwd)) {
        const pluginEntryPath = path.join(cwd, 'node_modules', dependencyName, 'index.js');
        if (!fs.existsSync(pluginEntryPath)) {
            continue;
        }
        try {
            const loaded = (await import(pathToFileURL(pluginEntryPath).href));
            const pluginModule = loaded.rules ? loaded : loaded.default;
            const rules = Array.isArray(pluginModule?.rules) ? pluginModule.rules : [];
            for (const pluginRule of rules) {
                const mapped = toVerifyRule(pluginRule);
                if (mapped) {
                    pluginRules.push(mapped);
                }
            }
        }
        catch {
            // Ignore broken plugin modules and continue loading available rules.
        }
    }
    return pluginRules;
};
export const loadVerifyRules = async (cwd) => {
    const merged = [...(await loadPluginRules(cwd)), ...coreVerifyRules];
    const deduped = [];
    const seen = new Set();
    for (const rule of merged) {
        if (seen.has(rule.id)) {
            continue;
        }
        seen.add(rule.id);
        deduped.push(rule);
    }
    return deduped;
};
//# sourceMappingURL=loadVerifyRules.js.map