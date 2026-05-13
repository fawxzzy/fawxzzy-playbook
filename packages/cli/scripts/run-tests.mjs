import { spawnSync } from 'node:child_process';

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const observerTarget = 'src/commands/observer.test.ts';
const hasExplicitFileParallelism = args.some((arg) => arg.startsWith('--fileParallelism'));
const hasExplicitPool = args.some((arg) => arg.startsWith('--pool'));

const run = (command, commandArgs) => spawnSync(command, commandArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

const exitWith = (result) => {
  if (typeof result.status === 'number') process.exit(result.status);
  process.exit(1);
};

const includesObserverTarget = args.includes(observerTarget);
const vitestArgs = args.filter((arg) => arg !== observerTarget);
const shouldRunDefaultVitest = vitestArgs.length > 0 || !includesObserverTarget;

if (shouldRunDefaultVitest) {
  const defaultVitestArgs = [
    'run',
    '--passWithNoTests',
    '--testTimeout=20000',
    ...(args.length === 0 ? ['--exclude', observerTarget] : vitestArgs),
  ];

  // Windows CLI tests are git- and filesystem-heavy; serial file execution avoids worker timeout noise.
  if (process.platform === 'win32' && !hasExplicitFileParallelism) {
    defaultVitestArgs.push('--fileParallelism=false');
  }

  if (process.platform === 'win32' && !hasExplicitPool) {
    defaultVitestArgs.push('--pool=threads');
  }

  const defaultResult = run('vitest', defaultVitestArgs);
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
