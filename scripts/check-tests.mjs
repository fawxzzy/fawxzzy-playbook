import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve('.');

const runGit = (args) => {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim());
  }
  return result.stdout.trim();
};

const resolveBaseRef = () => {
  const candidates = ['origin/main', 'origin/master', 'main', 'master'];
  for (const candidate of candidates) {
    const probe = spawnSync('git', ['rev-parse', '--verify', candidate], { cwd: repoRoot, encoding: 'utf8' });
    if (probe.status === 0) {
      return runGit(['merge-base', 'HEAD', candidate]);
    }
  }

  const fallback = spawnSync('git', ['rev-parse', '--verify', 'HEAD~1'], { cwd: repoRoot, encoding: 'utf8' });
  if (fallback.status === 0) {
    return runGit(['rev-parse', 'HEAD~1']);
  }

  return runGit(['rev-parse', 'HEAD']);
};

const baseRef = resolveBaseRef();
const diffOutput = runGit(['diff', '--name-only', '--diff-filter=A', `${baseRef}...HEAD`]);
const addedFiles = diffOutput ? diffOutput.split('\n').filter(Boolean) : [];

const commandCandidates = addedFiles
  .filter((file) => file.startsWith('packages/cli/src/commands/') && file.endsWith('.ts'))
  .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('/index.ts'));

const ruleCandidates = addedFiles
  .filter((file) => file.startsWith('packages/engine/src/verify/rules/') && file.endsWith('.ts'))
  .filter((file) => !file.endsWith('.test.ts'));

const isCommandModule = (relativePath) => {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return false;
  }

  const source = fs.readFileSync(absolutePath, 'utf8');
  return /export const run[A-Z]\w*\s*=/.test(source);
};

const missing = [];

for (const commandPath of commandCandidates) {
  if (!isCommandModule(commandPath)) {
    continue;
  }

  const testPath = commandPath.replace(/\.ts$/, '.test.ts');
  if (!fs.existsSync(path.join(repoRoot, testPath))) {
    missing.push({ type: 'command', source: commandPath, test: testPath });
  }
}

for (const rulePath of ruleCandidates) {
  const basename = path.basename(rulePath, '.ts');
  const testPath = `packages/engine/test/${basename}.test.ts`;
  if (!fs.existsSync(path.join(repoRoot, testPath))) {
    missing.push({ type: 'verify-rule', source: rulePath, test: testPath });
  }
}

if (missing.length > 0) {
  for (const item of missing) {
    console.error(`[check-tests] Missing test for ${item.type}: ${item.source}`);
    console.error(`[check-tests] Expected: ${item.test}`);
  }
  process.exit(1);
}

console.log('[check-tests] pass');
