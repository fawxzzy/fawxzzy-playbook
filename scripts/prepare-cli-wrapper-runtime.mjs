import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const cliDistDir = path.join(repoRoot, 'packages', 'cli', 'dist');
const wrapperRuntimeDir = path.join(repoRoot, 'packages', 'cli-wrapper', 'runtime');

if (!fs.existsSync(cliDistDir)) {
  throw new Error(`Missing CLI dist runtime at ${cliDistDir}. Run "pnpm -C packages/cli build" first.`);
}

fs.rmSync(wrapperRuntimeDir, { recursive: true, force: true });
fs.mkdirSync(path.dirname(wrapperRuntimeDir), { recursive: true });
fs.cpSync(cliDistDir, wrapperRuntimeDir, { recursive: true });

process.stdout.write(`Prepared cli-wrapper runtime: ${cliDistDir} -> ${wrapperRuntimeDir}\n`);
