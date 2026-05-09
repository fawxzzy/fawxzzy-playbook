const knowledgeTypes = ['evidence', 'candidate', 'promoted', 'superseded'];
const knowledgeStatuses = ['observed', 'active', 'stale', 'retired', 'superseded'];
const knowledgeLifecycles = ['observed', 'candidate', 'active', 'stale', 'retired', 'superseded', 'demoted'];
export const printKnowledgeHelp = () => {
    console.log(`Usage: playbook knowledge <subcommand> [options]

Inspect repository knowledge artifacts through read-only deterministic surfaces.

Subcommands:
  list                            List evidence, candidate, promoted, and superseded knowledge records
  query                           Filter knowledge records
  inspect <id>                    Inspect one knowledge record by id
  compare <left-id> <right-id>    Compare two knowledge records
  timeline                        Show the knowledge timeline
  provenance <id>                 Show provenance and related evidence for one record
  supersession <id>               Show supersession links for one record
  stale                           Show stale, retired, and superseded records
  portability                     Inspect cross-repo portability scoring evidence
  review                          Materialize and inspect retrieval review queue entries
  review handoffs                 Materialize and inspect review follow-up handoffs
  review routes                   Materialize and inspect routed review follow-up suggestions
  review followups                Materialize and inspect compiled downstream follow-up suggestions
  review record                   Record a durable retrieval review receipt

Options:
  --type <type>                Filter by type (evidence|candidate|promoted|superseded)
  --status <status>            Filter by status (observed|active|stale|retired|superseded)
  --lifecycle <state>          Filter by lifecycle (observed|candidate|active|stale|retired|superseded|demoted)
  --module <module>            Filter by module
  --rule <rule-id>             Filter by rule id
  --text <query>               Full-text filter across serialized records
  --limit <n>                  Limit returned records
  --order <asc|desc>           Ordering for list/timeline/stale (default desc)
  --days <n>                   Override stale threshold in days
  --action <action>            Review filter (reaffirm|revise|supersede)
  --kind <kind>                Review filter (knowledge|doc|rule|pattern)
  --due <scope>               Review cadence filter (now|overdue|all; default all)
  --trigger <scope>           Review trigger filter (cadence|evidence|all; default all)
  --trigger-source <source>   Review trigger-source filter (for example architecture-decision|interop-followup)
  --decision <decision>       Review handoff/record decision filter (handoffs: revise|supersede; record: reaffirm|revise|supersede|defer)
  --surface <surface>         Review routes filter (story|promote|docs|memory)
  --from <queueEntryId>        Review record source queue entry id
  --reason-code <id>           Optional review record reason-code override
  --evidence-ref <value>       Optional evidence reference (repeatable)
  --followup-ref <value>       Optional follow-up artifact reference (repeatable)
  --receipt-id <id>            Optional stable receipt id for deterministic upsert
  --json                       Print machine-readable JSON output
  --help                       Show help`);
};
export const printKnowledgePortabilityHelp = () => {
    console.log(`Usage: playbook knowledge portability [--view <view>] [--json]

Inspect cross-repo portability records through deterministic read-only views.

Views:
  overview                      Baseline portability scoring evidence (default)
  recommendations               Pattern transfer recommendations by source/target repo
  outcomes                      Adoption decisions and observed outcomes
  recalibration                 Confidence recalibration records with evidence/sample sizes
  transfer-plans                Cross-repo transfer planning records
  readiness                     Target-readiness assessments
  blocked-transfers             Readiness records with unresolved blockers

Options:
  --view <view>                 Select portability view (overview|recommendations|outcomes|recalibration|transfer-plans|readiness|blocked-transfers)
  --json                        Print machine-readable JSON output
  --help                        Show help`);
};
export const readOptionValue = (args, optionName) => {
    const exactIndex = args.findIndex((arg) => arg === optionName);
    if (exactIndex >= 0) {
        return args[exactIndex + 1] ?? null;
    }
    const prefixed = args.find((arg) => arg.startsWith(`${optionName}=`));
    if (!prefixed) {
        return null;
    }
    return prefixed.slice(optionName.length + 1) || null;
};
export const readOptionValues = (args, optionName) => {
    const exactValues = args.flatMap((arg, index) => (args[index - 1] === optionName ? [arg] : []));
    const prefixedValues = args
        .filter((arg) => arg.startsWith(`${optionName}=`))
        .map((arg) => arg.slice(optionName.length + 1));
    return [...exactValues, ...prefixedValues].filter((value) => typeof value === 'string' && value.length > 0);
};
export const parseIntegerOption = (raw, optionName) => {
    if (raw === null) {
        return undefined;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`playbook knowledge: invalid ${optionName} value "${raw}"; expected a non-negative integer`);
    }
    return parsed;
};
export const parseOrderOption = (raw) => {
    if (raw === null || raw === 'desc') {
        return 'desc';
    }
    if (raw === 'asc') {
        return 'asc';
    }
    throw new Error(`playbook knowledge: invalid --order value "${raw}"; expected asc or desc`);
};
export const parseTypeOption = (raw) => {
    if (raw === null) {
        return undefined;
    }
    if (knowledgeTypes.includes(raw)) {
        return raw;
    }
    throw new Error(`playbook knowledge: invalid --type value "${raw}"`);
};
export const parseStatusOption = (raw) => {
    if (raw === null) {
        return undefined;
    }
    if (knowledgeStatuses.includes(raw)) {
        return raw;
    }
    throw new Error(`playbook knowledge: invalid --status value "${raw}"`);
};
export const parseLifecycleOption = (raw) => {
    if (raw === null)
        return undefined;
    if (knowledgeLifecycles.includes(raw)) {
        return raw;
    }
    throw new Error(`playbook knowledge: invalid --lifecycle value "${raw}"`);
};
export const resolveSubcommandArgument = (args) => {
    const positional = args.filter((arg) => !arg.startsWith('-'));
    if (positional.length < 2) {
        return null;
    }
    return positional[1] ?? null;
};
export const parseKnowledgeFilters = (args) => ({
    type: parseTypeOption(readOptionValue(args, '--type')),
    status: parseStatusOption(readOptionValue(args, '--status')),
    lifecycle: parseLifecycleOption(readOptionValue(args, '--lifecycle')),
    module: readOptionValue(args, '--module') ?? undefined,
    ruleId: readOptionValue(args, '--rule') ?? undefined,
    text: readOptionValue(args, '--text') ?? undefined,
    limit: parseIntegerOption(readOptionValue(args, '--limit'), '--limit'),
    order: parseOrderOption(readOptionValue(args, '--order')),
    staleDays: parseIntegerOption(readOptionValue(args, '--days'), '--days')
});
//# sourceMappingURL=shared.js.map