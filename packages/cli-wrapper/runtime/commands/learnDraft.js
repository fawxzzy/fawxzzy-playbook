import fs from 'node:fs';
import path from 'node:path';
import { generateKnowledgeCandidatesDraft } from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
import { emitJsonOutput, writeJsonArtifact } from '../lib/jsonArtifact.js';
const DEFAULT_OUT_FILE = '.playbook/knowledge/candidates.json';
const printLearnHelp = () => {
    console.log(`Usage: playbook learn draft [options]

Generate deterministic knowledge candidates from local diff context and Playbook repository intelligence.

Options:
  --base <ref>       Optional git base ref used for diff resolution
  --diff-context     Include local diff context (default true)
  --no-diff-context  Disable diff context and emit baseline candidate themes
  --append-notes     Append a human-readable draft section to docs/PLAYBOOK_NOTES.md
  --out <path>       Write JSON artifact path (default .playbook/knowledge/candidates.json)
  --json             Print machine-readable JSON output
  --help             Show help`);
};
const resolveNotesPath = (cwd) => path.join(cwd, 'docs', 'PLAYBOOK_NOTES.md');
const appendNotesDraft = (cwd, payload) => {
    const notesPath = resolveNotesPath(cwd);
    const heading = `## Learn Draft ${payload.headSha.slice(0, 8)}`;
    const changedFiles = payload.changedFiles.length > 0 ? payload.changedFiles.map((filePath) => `- ${filePath}`).join('\n') : '- none';
    const candidates = payload.candidates.length > 0
        ? payload.candidates.map((candidate) => `- ${candidate.candidateId} (${candidate.theme})`).join('\n')
        : '- none';
    const section = `${heading}

- Base ref: ${payload.baseRef}
- Base SHA: ${payload.baseSha}
- Head SHA: ${payload.headSha}
- Diff context: ${payload.diffContext ? 'enabled' : 'disabled'}

### Changed files
${changedFiles}

### Candidate themes
${candidates}
`;
    fs.mkdirSync(path.dirname(notesPath), { recursive: true });
    const existing = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, 'utf8') : '# PLAYBOOK NOTES\n\n';
    const separator = existing.endsWith('\n') ? '' : '\n';
    fs.writeFileSync(notesPath, `${existing}${separator}${section}\n`, 'utf8');
};
export const runLearnDraft = async (cwd, commandArgs, options) => {
    if (commandArgs.includes('--help') || commandArgs.includes('-h')) {
        printLearnHelp();
        return ExitCode.Success;
    }
    try {
        const payload = generateKnowledgeCandidatesDraft(cwd, {
            baseRef: options.baseRef,
            diffContext: options.diffContext
        });
        const outFile = options.outFile ?? DEFAULT_OUT_FILE;
        writeJsonArtifact(cwd, outFile, payload, 'learn draft');
        if (options.appendNotes) {
            appendNotesDraft(cwd, payload);
        }
        if (options.format === 'json') {
            emitJsonOutput({
                cwd,
                command: 'learn draft',
                payload
            });
            return ExitCode.Success;
        }
        if (!options.quiet) {
            console.log(`Generated ${payload.candidates.length} knowledge candidates.`);
            console.log(`Wrote artifact: ${outFile}`);
            if (options.appendNotes) {
                console.log('Appended notes draft: docs/PLAYBOOK_NOTES.md');
            }
        }
        return ExitCode.Success;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.format === 'json') {
            console.log(JSON.stringify({
                schemaVersion: '1.0',
                command: 'learn-draft',
                error: message
            }, null, 2));
        }
        else {
            console.error(message);
        }
        return ExitCode.Failure;
    }
};
//# sourceMappingURL=learnDraft.js.map