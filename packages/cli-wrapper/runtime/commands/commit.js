import { spawnSync } from 'node:child_process';
import { ExitCode } from '../lib/cliContract.js';
import { printCommandHelp } from '../lib/commandSurface.js';
const runChild = (cwd, command, args) => {
    const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
    return result.status ?? 1;
};
export const runCommit = async (cwd, commitArgs, options) => {
    if (options.help) {
        printCommandHelp({
            usage: 'playbook commit [git-commit-args]',
            description: 'Run release sync, stage all changes, then execute git commit with pass-through arguments.',
            options: [
                '-m <message>         pass-through to git commit',
                '--help               show help'
            ],
            artifacts: ['docs/CHANGELOG.md', 'packages/**/package.json']
        });
        return ExitCode.Success;
    }
    if (runChild(cwd, 'pnpm', ['playbook', 'release', 'sync']) !== 0)
        return ExitCode.Failure;
    if (runChild(cwd, 'git', ['add', '-A']) !== 0)
        return ExitCode.Failure;
    if (runChild(cwd, 'git', ['commit', ...commitArgs]) !== 0)
        return ExitCode.Failure;
    return ExitCode.Success;
};
//# sourceMappingURL=commit.js.map