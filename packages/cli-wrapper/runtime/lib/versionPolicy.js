import fs from 'node:fs';
import path from 'node:path';
const IGNORE_DIRS = new Set(['node_modules', '.git', '.playbook', 'dist', 'build', 'coverage']);
const readJson = (filePath) => {
    if (!fs.existsSync(filePath)) {
        return undefined;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};
const normalizeRelativePath = (value) => {
    const normalized = value.split(path.sep).join('/');
    return normalized === '' ? '.' : normalized;
};
const collectPackageJsonPaths = (root, current = root, results = []) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (IGNORE_DIRS.has(entry.name)) {
                continue;
            }
            collectPackageJsonPaths(root, path.join(current, entry.name), results);
            continue;
        }
        if (entry.isFile() && entry.name === 'package.json') {
            results.push(path.join(current, entry.name));
        }
    }
    return results;
};
const escapeRegex = (value) => value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
const globToRegExp = (pattern) => {
    let result = '^';
    for (let index = 0; index < pattern.length; index += 1) {
        const char = pattern[index];
        const next = pattern[index + 1];
        if (char === '*') {
            if (next === '*') {
                result += '.*';
                index += 1;
            }
            else {
                result += '[^/]*';
            }
            continue;
        }
        result += escapeRegex(char);
    }
    result += '$';
    return new RegExp(result);
};
const readWorkspacePatterns = (repoRoot) => {
    const packageJson = readJson(path.join(repoRoot, 'package.json'));
    const workspaces = packageJson?.workspaces;
    const patterns = new Set();
    if (Array.isArray(workspaces)) {
        for (const entry of workspaces) {
            if (typeof entry === 'string' && entry.trim().length > 0) {
                patterns.add(entry.trim().replace(/\/package\.json$/, ''));
            }
        }
    }
    else if (workspaces && typeof workspaces === 'object' && Array.isArray(workspaces.packages)) {
        for (const entry of workspaces.packages ?? []) {
            if (typeof entry === 'string' && entry.trim().length > 0) {
                patterns.add(entry.trim().replace(/\/package\.json$/, ''));
            }
        }
    }
    const pnpmWorkspacePath = path.join(repoRoot, 'pnpm-workspace.yaml');
    if (fs.existsSync(pnpmWorkspacePath)) {
        const lines = fs.readFileSync(pnpmWorkspacePath, 'utf8').split('\n');
        let inPackages = false;
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (line === 'packages:' || line === 'packages: []') {
                inPackages = line === 'packages:';
                continue;
            }
            if (!inPackages) {
                continue;
            }
            if (!line.startsWith('- ')) {
                if (line.length > 0 && !line.startsWith('#')) {
                    inPackages = false;
                }
                continue;
            }
            const value = line.slice(2).trim().replace(/^['"]|['"]$/g, '');
            if (value.length > 0) {
                patterns.add(value.replace(/\/package\.json$/, ''));
            }
        }
    }
    return Array.from(patterns);
};
const packageDescriptorFor = (repoRoot, packageJsonPath) => {
    const pkg = readJson(packageJsonPath);
    if (!pkg) {
        return undefined;
    }
    const packageDir = path.dirname(packageJsonPath);
    const relativePath = normalizeRelativePath(path.relative(repoRoot, packageDir));
    return {
        name: typeof pkg.name === 'string' ? pkg.name : undefined,
        path: relativePath,
        private: pkg.private === true
    };
};
export const detectPublishableNodePnpmPackages = (repoRoot) => {
    const packageJsonPath = path.join(repoRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        return [];
    }
    const rootPackage = packageDescriptorFor(repoRoot, packageJsonPath);
    const workspacePatterns = readWorkspacePatterns(repoRoot);
    const workspaceMatchers = workspacePatterns.map((pattern) => globToRegExp(pattern));
    const packageJsonFiles = collectPackageJsonPaths(repoRoot);
    const seen = new Set();
    const packages = [];
    for (const packagePath of packageJsonFiles) {
        const descriptor = packageDescriptorFor(repoRoot, packagePath);
        if (!descriptor || descriptor.private) {
            continue;
        }
        if (descriptor.path === '.') {
            seen.add(descriptor.path);
            packages.push(descriptor);
            continue;
        }
        if (workspaceMatchers.length === 0) {
            continue;
        }
        if (workspaceMatchers.some((matcher) => matcher.test(descriptor.path)) && !seen.has(descriptor.path)) {
            seen.add(descriptor.path);
            packages.push(descriptor);
        }
    }
    if (rootPackage && !rootPackage.private && !seen.has(rootPackage.path)) {
        packages.unshift(rootPackage);
    }
    return packages.sort((left, right) => left.path.localeCompare(right.path));
};
export const shouldSeedDefaultVersionPolicy = (repoRoot) => {
    const markers = [path.join(repoRoot, 'pnpm-lock.yaml'), path.join(repoRoot, 'pnpm-workspace.yaml')];
    const packageJson = readJson(path.join(repoRoot, 'package.json'));
    const packageManager = typeof packageJson?.packageManager === 'string' ? packageJson.packageManager : '';
    const usesPnpm = packageManager.startsWith('pnpm@') || markers.some((marker) => fs.existsSync(marker));
    return usesPnpm && detectPublishableNodePnpmPackages(repoRoot).length > 0;
};
export const buildVersionPolicy = (repoRoot) => {
    const publishablePackages = detectPublishableNodePnpmPackages(repoRoot);
    if (publishablePackages.length === 0 || !shouldSeedDefaultVersionPolicy(repoRoot)) {
        return {
            version: 1,
            enabled: false,
            optOutAllowed: true,
            defaultStrategy: 'lockstep',
            groups: []
        };
    }
    return {
        version: 1,
        enabled: true,
        optOutAllowed: true,
        defaultStrategy: 'lockstep',
        groups: [
            {
                name: 'default',
                strategy: 'lockstep',
                packages: publishablePackages.map((entry) => entry.path)
            }
        ]
    };
};
export const versionPolicyRelativePath = path.join('.playbook', 'version-policy.json');
export const writeVersionPolicy = (repoRoot) => {
    const filePath = path.join(repoRoot, versionPolicyRelativePath);
    const content = `${JSON.stringify(buildVersionPolicy(repoRoot), null, 2)}\n`;
    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : undefined;
    if (current === content) {
        return { changed: false, filePath, content };
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return { changed: true, filePath, content };
};
//# sourceMappingURL=versionPolicy.js.map