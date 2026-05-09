import fs from 'node:fs';
import path from 'node:path';
const DEFAULT_PLAYBOOK_CONFIG = {
    version: 1,
    docs: {
        notesPath: 'docs/PLAYBOOK_NOTES.md',
        architecturePath: 'docs/ARCHITECTURE.md',
        governancePath: 'docs/PROJECT_GOVERNANCE.md',
        checklistPath: 'docs/PLAYBOOK_CHECKLIST.md'
    },
    analyze: {
        detectors: ['nextjs', 'supabase', 'tailwind']
    },
    plugins: [],
    verify: {
        rules: {
            requireNotesOnChanges: [
                {
                    whenChanged: ['src/**', 'app/**', 'server/**', 'supabase/**'],
                    mustTouch: ['docs/PLAYBOOK_NOTES.md']
                }
            ]
        }
    }
};
const asRelative = (cwd, target) => path.relative(cwd, target) || '.';
const ensureDocsDirectoryFix = {
    id: 'doctor.fix.docs.directory',
    description: 'Ensure docs/ directory exists.',
    safeToAutoApply: true,
    check: async ({ cwd }) => {
        const docsDir = path.join(cwd, 'docs');
        return { applicable: !fs.existsSync(docsDir) };
    },
    fix: async ({ cwd, dryRun }) => {
        const docsDir = path.join(cwd, 'docs');
        if (!dryRun) {
            fs.mkdirSync(docsDir, { recursive: true });
        }
        return { changes: [asRelative(cwd, docsDir)] };
    }
};
const ensurePlaybookDirectoriesFix = {
    id: 'doctor.fix.playbook.directories',
    description: 'Ensure .playbook/config and .playbook/cache directories exist.',
    safeToAutoApply: true,
    check: async ({ cwd }) => {
        const dirs = [path.join(cwd, '.playbook', 'config'), path.join(cwd, '.playbook', 'cache')];
        const missing = dirs.filter((dir) => !fs.existsSync(dir));
        return {
            applicable: missing.length > 0,
            reason: missing.length > 0
                ? `Missing directories: ${missing.map((entry) => asRelative(cwd, entry)).join(', ')}`
                : undefined
        };
    },
    fix: async ({ cwd, dryRun }) => {
        const dirs = [path.join(cwd, '.playbook', 'config'), path.join(cwd, '.playbook', 'cache')];
        const created = [];
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                if (!dryRun) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                created.push(asRelative(cwd, dir));
            }
        }
        return { changes: created };
    }
};
const ensureConfigFileFix = {
    id: 'doctor.fix.config.file',
    description: 'Repair missing playbook.config.json using Playbook defaults.',
    safeToAutoApply: true,
    check: async ({ cwd }) => {
        const configPath = path.join(cwd, 'playbook.config.json');
        return { applicable: !fs.existsSync(configPath) };
    },
    fix: async ({ cwd, dryRun }) => {
        const configPath = path.join(cwd, 'playbook.config.json');
        if (!dryRun) {
            fs.writeFileSync(configPath, `${JSON.stringify(DEFAULT_PLAYBOOK_CONFIG, null, 2)}\n`, 'utf8');
        }
        return { changes: [asRelative(cwd, configPath)] };
    }
};
export const doctorFixes = [ensureDocsDirectoryFix, ensurePlaybookDirectoriesFix, ensureConfigFileFix];
//# sourceMappingURL=doctorFixes.js.map