import fs from 'node:fs';
import path from 'node:path';
import type { ReportFailure } from '../../report/types.js';

const isCommandPath = (filePath: string): boolean =>
  filePath.startsWith('packages/cli/src/commands/') &&
  filePath.endsWith('.ts') &&
  !filePath.endsWith('.test.ts') &&
  !filePath.endsWith('/index.ts');

const isVerifyRulePath = (filePath: string): boolean =>
  filePath.startsWith('packages/engine/src/verify/rules/') && filePath.endsWith('.ts');

const isCommandModule = (repoRoot: string, relativePath: string): boolean => {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return false;
  }

  const source = fs.readFileSync(absolutePath, 'utf8');
  return /export const run[A-Z]\w*\s*=/.test(source);
};

export const requireTestsForNewCommands = (
  repoRoot: string,
  changedFiles: string[]
): ReportFailure[] => {
  const failures: ReportFailure[] = [];

  for (const filePath of changedFiles.filter(isCommandPath)) {
    if (!isCommandModule(repoRoot, filePath)) {
      continue;
    }

    const testPath = filePath.replace(/\.ts$/, '.test.ts');
    if (fs.existsSync(path.join(repoRoot, testPath))) {
      continue;
    }

    failures.push({
      id: 'verify.rule.tests.required',
      message: `Missing test file for command: ${path.basename(filePath, '.ts')}`,
      evidence: filePath,
      fix: `Create ${testPath}`
    });
  }

  for (const filePath of changedFiles.filter(isVerifyRulePath)) {
    const testPath = `packages/engine/test/${path.basename(filePath, '.ts')}.test.ts`;

    if (fs.existsSync(path.join(repoRoot, testPath))) {
      continue;
    }

    failures.push({
      id: 'verify.rule.tests.required',
      message: `Missing test file for verify rule: ${path.basename(filePath, '.ts')}`,
      evidence: filePath,
      fix: `Create ${testPath}`
    });
  }

  return failures;
};
