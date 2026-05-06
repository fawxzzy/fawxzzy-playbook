import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const nodeCommand = process.execPath;

export const repoRootFromImportMeta = (metaUrl) =>
  path.resolve(path.dirname(fileURLToPath(metaUrl)), '../..');

let packageManagerShimDir = null;
let patchedNodeBootstrapPath = null;

const getNodeBinDir = () => path.dirname(process.execPath);

const packageManagerCommands = {
  npm: () => ({ command: path.join(getNodeBinDir(), 'npm.cmd'), extraArgs: [] }),
  pnpm: () => ({ command: path.join(getNodeBinDir(), 'pnpm.cmd'), extraArgs: [] }),
  yarn: () => ({ command: path.join(getNodeBinDir(), 'corepack.cmd'), extraArgs: ['yarn'] }),
  corepack: () => ({ command: path.join(getNodeBinDir(), 'corepack.cmd'), extraArgs: [] })
};

const ensureExecutableShim = (shimPath, targetCommand, extraArgs = []) => {
  if (fs.existsSync(shimPath)) {
    return;
  }

  const serializedArgs = extraArgs.map((arg) => `"${arg}"`).join(' ');
  const prefix = serializedArgs ? `${serializedArgs} ` : '';
  fs.writeFileSync(shimPath, `@echo off\r\n"${targetCommand}" ${prefix}%*\r\n`, 'utf8');
};

const ensurePackageManagerShimDir = () => {
  if (process.platform !== 'win32') {
    return null;
  }

  if (packageManagerShimDir) {
    return packageManagerShimDir;
  }

  const nodeBinDir = getNodeBinDir();
  const npmCmd = path.join(nodeBinDir, 'npm.cmd');
  const corepackCmd = path.join(nodeBinDir, 'corepack.cmd');

  packageManagerShimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-test-bin-'));
  ensureExecutableShim(path.join(packageManagerShimDir, 'npm.cmd'), npmCmd);
  ensureExecutableShim(path.join(packageManagerShimDir, 'pnpm.cmd'), corepackCmd, ['pnpm']);
  ensureExecutableShim(path.join(packageManagerShimDir, 'yarn.cmd'), corepackCmd, ['yarn']);

  return packageManagerShimDir;
};

export const createScriptEnv = (overrides = {}) => {
  const env = { ...process.env, ...overrides };

  if (process.platform !== 'win32') {
    return env;
  }

  const shimDir = ensurePackageManagerShimDir();
  const nodeBinDir = path.dirname(process.execPath);
  const existingPath = env.Path ?? env.PATH ?? '';
  const pathSegments = [nodeBinDir, shimDir, existingPath].filter(Boolean);
  const nextPath = pathSegments.join(';');
  env.Path = nextPath;
  env.PATH = nextPath;

  return env;
};

export const resolvePackageManagerCommand = (command) => {
  if (process.platform !== 'win32') {
    return { command, extraArgs: [] };
  }

  const resolver = packageManagerCommands[command];
  return resolver ? resolver() : { command, extraArgs: [] };
};

const ensurePatchedNodeBootstrap = () => {
  if (process.platform !== 'win32') {
    return null;
  }

  if (patchedNodeBootstrapPath) {
    return patchedNodeBootstrapPath;
  }

  patchedNodeBootstrapPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-node-bootstrap-')), 'bootstrap.mjs');
  fs.writeFileSync(
    patchedNodeBootstrapPath,
    `import path from 'node:path';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';

const nodeBinDir = path.dirname(process.execPath);
const commandMap = new Map([
  ['npm', {
    command: process.execPath,
    buildArgs: (args) => [path.join(nodeBinDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), ...args]
  }],
  ['pnpm', {
    command: process.execPath,
    buildArgs: (args) => [path.join(nodeBinDir, 'node_modules', 'corepack', 'dist', 'pnpm.js'), ...args]
  }],
  ['yarn', {
    command: process.execPath,
    buildArgs: (args) => [path.join(nodeBinDir, 'node_modules', 'corepack', 'dist', 'yarn.js'), ...args]
  }],
  ['corepack', {
    command: process.execPath,
    buildArgs: (args) => [path.join(nodeBinDir, 'node_modules', 'corepack', 'dist', 'corepack.js'), ...args]
  }]
]);

const remapCommand = (command, args = []) => {
  if (typeof command !== 'string') {
    return { command, args };
  }

  const mapped = commandMap.get(command.toLowerCase());
  if (!mapped) {
    return { command, args };
  }

  return {
    command: mapped.command,
    args: mapped.buildArgs(Array.isArray(args) ? args : [])
  };
};

const originalSpawnSync = childProcess.spawnSync;
childProcess.spawnSync = function patchedSpawnSync(command, args, options) {
  const next = remapCommand(command, args);
  return originalSpawnSync.call(this, next.command, next.args, options);
};

const originalExecFileSync = childProcess.execFileSync;
childProcess.execFileSync = function patchedExecFileSync(command, args, options) {
  const next = remapCommand(command, args);
  return originalExecFileSync.call(this, next.command, next.args, options);
};

syncBuiltinESMExports();

const [, , targetScript, ...targetArgs] = process.argv;
process.argv = [process.argv[0], targetScript, ...targetArgs];
await import(pathToFileURL(targetScript).href);
`,
    'utf8'
  );

  return patchedNodeBootstrapPath;
};

export const createPatchedNodeArgs = (scriptPath, scriptArgs = []) => {
  if (process.platform !== 'win32') {
    return [scriptPath, ...scriptArgs];
  }

  return [ensurePatchedNodeBootstrap(), scriptPath, ...scriptArgs];
};
