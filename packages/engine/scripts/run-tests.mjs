import { spawnSync } from 'node:child_process';

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const hasExplicitFileParallelism = args.some((arg) => arg.startsWith('--fileParallelism'));

const run = (command, commandArgs) => spawnSync(command, commandArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

const exitWith = (result) => {
  if (typeof result.status === 'number') process.exit(result.status);
  process.exit(1);
};

const defaultVitestArgs = ['run'];

// Windows engine tests are git- and temp-heavy; serial file execution avoids worker timeout pressure.
if (process.platform === 'win32' && !hasExplicitFileParallelism) {
  defaultVitestArgs.push('--fileParallelism=false');
}

const result = run('vitest', [...defaultVitestArgs, ...args]);
exitWith(result);
