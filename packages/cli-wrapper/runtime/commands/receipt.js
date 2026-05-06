import fs from "node:fs";
import path from "node:path";
import { ExitCode } from "../lib/cliContract.js";
import { parseExecutionResults, persistExecutionControlLoop, } from "./execution/receiptIngest.js";
import { loadReplayExecutionOutcomeInput, replayExecutionOutcomeInput, } from "./execution/replay.js";
const readOptionValue = (args, optionName) => {
    const exactIndex = args.findIndex((arg) => arg === optionName);
    if (exactIndex >= 0)
        return args[exactIndex + 1] ?? null;
    const prefixed = args.find((arg) => arg.startsWith(`${optionName}=`));
    return prefixed ? prefixed.slice(optionName.length + 1) || null : null;
};
const printHelp = () => {
    console.log(`Usage: playbook receipt <subcommand> [options]\n\nSubcommands:\n  ingest <file>    Ingest explicit execution results into receipt -> updated-state -> next-queue\n  replay           Re-run canonical receipt -> updated-state -> next-queue from an execution outcome input artifact`);
};
export const runReceipt = async (cwd, args, options) => {
    try {
        const subcommand = args.find((arg) => !arg.startsWith("-"));
        if (!subcommand || args.includes("--help") || args.includes("-h")) {
            printHelp();
            return subcommand ? ExitCode.Success : ExitCode.Failure;
        }
        if (subcommand !== "ingest" && subcommand !== "replay") {
            throw new Error("playbook receipt: unsupported subcommand. Use `playbook receipt ingest <file>` or `playbook receipt replay`.");
        }
        if (subcommand === "replay") {
            const inputPath = readOptionValue(args, "--input") ??
                readOptionValue(args, "--file") ??
                undefined;
            const { outcomeInput, inputArtifactPath, replayMode } = loadReplayExecutionOutcomeInput(cwd, inputPath);
            const replayed = replayExecutionOutcomeInput(cwd, outcomeInput, {
                inputArtifactPath,
                replayMode,
            });
            const payload = {
                ...replayed,
                command: "receipt",
                mode: "replay",
            };
            if (options.format === "json")
                console.log(JSON.stringify(payload, null, 2));
            else if (!options.quiet) {
                console.log(`Replay classification: ${payload.classification}`);
                console.log(`Replay deterministic: ${payload.deterministic ? "yes" : "no"}`);
                console.log(`Matched plan: ${payload.summary.matched_plan ? "yes" : "no"}`);
                console.log(`Changed: ${payload.summary.changed.join("; ")}`);
                console.log(`What happened: ${payload.summary.what_happened}`);
                console.log(`Next: ${payload.summary.next_steps.join(" ")}`);
            }
            return payload.classification === "mismatch"
                ? ExitCode.Failure
                : ExitCode.Success;
        }
        const ingestArgs = args
            .slice(args.indexOf("ingest") + 1)
            .filter((arg) => !arg.startsWith("--"));
        const fileArg = ingestArgs[0] ?? readOptionValue(args, "--file");
        if (!fileArg)
            throw new Error("playbook receipt ingest: missing <file> argument");
        const absoluteInput = path.isAbsolute(fileArg)
            ? fileArg
            : path.join(cwd, fileArg);
        const executionResults = parseExecutionResults(fs.readFileSync(absoluteInput, "utf8"));
        const ingested = persistExecutionControlLoop(cwd, executionResults);
        const payload = {
            schemaVersion: "1.0",
            command: "receipt",
            mode: "ingest",
            receipt: ingested.receipt_with_promotion,
            updated_state: ingested.updated_state,
            next_queue: ingested.next_queue,
            execution_outcome_input: ingested.execution_outcome_input,
            promotion: ingested.promotion,
            story_transition: ingested.story_transition,
            lifecycle_candidates: ingested.lifecycle_candidates,
            written_artifacts: ingested.written_artifacts,
        };
        if (options.format === "json")
            console.log(JSON.stringify(payload, null, 2));
        else if (!options.quiet) {
            console.log(`Ingested execution results: ${executionResults.length}`);
            console.log(`Receipt prompts: ${payload.receipt.verification_summary.prompts_total}`);
            console.log(`Updated-state repos needing retry: ${payload.updated_state.summary.repos_needing_retry.length}`);
            console.log(`Next-queue items: ${payload.next_queue.work_items.length}`);
            console.log(`Wrote: ${payload.written_artifacts.execution_outcome_input}`);
        }
        return ingested.promotion.promoted ? ExitCode.Success : ExitCode.Failure;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.format === "json")
            console.log(JSON.stringify({ schemaVersion: "1.0", command: "receipt", error: message }, null, 2));
        else
            console.error(message);
        return ExitCode.Failure;
    }
};
//# sourceMappingURL=receipt.js.map