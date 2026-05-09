import fs from 'node:fs';
import path from 'node:path';
import { buildTestTriageArtifact, renderTestTriageMarkdown } from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
const usage = 'Usage: playbook test-triage [--input <failure-log-path>] [--json]';
const readStdin = async () => new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
});
const readInputLog = async (cwd, inputPath) => {
    if (inputPath) {
        const absolute = path.resolve(cwd, inputPath);
        return {
            rawLog: fs.readFileSync(absolute, 'utf8'),
            path: inputPath,
            input: 'file'
        };
    }
    if (!process.stdin.isTTY) {
        return {
            rawLog: await readStdin(),
            path: null,
            input: 'stdin'
        };
    }
    throw new Error('playbook test-triage: provide --input <failure-log-path> or pipe failure output on stdin.');
};
export const runTestTriage = async (cwd, options) => {
    if (options.help) {
        console.log(usage);
        console.log('Parse captured Vitest, pnpm recursive failure output, GitHub Actions annotations, and stdin into a deterministic failure summary.');
        return ExitCode.Success;
    }
    try {
        const source = await readInputLog(cwd, options.input);
        const artifact = buildTestTriageArtifact(source.rawLog, { input: source.input, path: source.path });
        if (options.format === 'json') {
            console.log(JSON.stringify(artifact, null, 2));
            return ExitCode.Success;
        }
        if (!options.quiet) {
            console.log(renderTestTriageMarkdown(artifact));
        }
        return ExitCode.Success;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.format === 'json') {
            console.log(JSON.stringify({ schemaVersion: '1.0', command: 'test-triage', error: message }, null, 2));
        }
        else {
            console.error(message);
        }
        return ExitCode.Failure;
    }
};
//# sourceMappingURL=testTriage.js.map