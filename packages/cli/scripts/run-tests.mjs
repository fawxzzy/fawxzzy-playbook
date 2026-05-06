import { spawnSync } from 'node:child_process';

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const observerTarget = 'src/commands/observer.test.ts';

const run = (command, commandArgs) => spawnSync(command, commandArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

const exitWith = (result) => {
  if (typeof result.status === 'number') process.exit(result.status);
  process.exit(1);
};

const onlyObserverTarget = args.length > 0 && args.every((arg) => arg === observerTarget);
if (onlyObserverTarget) {
  const buildResult = run('pnpm', ['build']);
  if ((buildResult.status ?? 1) !== 0) {
    exitWith(buildResult);
  }

  const observerResult = run('node', ['./scripts/run-observer-tests.mjs']);
  exitWith(observerResult);
}

const includesObserverTarget = args.includes(observerTarget);
const vitestArgs = args.filter((arg) => arg !== observerTarget);
const shouldRunDefaultVitest = vitestArgs.length > 0 || !includesObserverTarget;

if (shouldRunDefaultVitest) {
  const defaultResult = run('vitest', [
    'run',
    '--passWithNoTests',
    '--testTimeout=20000',
    ...(args.length === 0 ? ['--exclude', observerTarget] : vitestArgs),
  ]);
  if ((defaultResult.status ?? 1) !== 0) {
    exitWith(defaultResult);
  }
}

if (args.length === 0 || includesObserverTarget) {
  const buildResult = run('pnpm', ['build']);
  if ((buildResult.status ?? 1) !== 0) {
    exitWith(buildResult);
  }

  const observerResult = run('node', ['./scripts/run-observer-tests.mjs']);
  exitWith(observerResult);
}

process.exit(0);
