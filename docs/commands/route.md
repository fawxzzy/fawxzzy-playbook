# `playbook route`

Classify a task into deterministic local execution, bounded model reasoning, hybrid execution, or unsupported, and emit a deterministic proposal-only execution plan artifact.

## Usage

```bash
pnpm playbook route "summarize current repo state"
pnpm playbook route "summarize current repo state" --json
pnpm playbook route "propose fix for failing tests"
pnpm playbook route "apply approved remediation plan"
```

## Output contract

Routing now returns command metadata plus an `executionPlan` payload and writes:

- `.playbook/execution-plan.json`

Execution plan fields include:

- `schemaVersion`, `kind`, `generatedAt`, `proposalOnly`
- `task_family`, `route_id`
- `rule_packs`, `required_validations`, `optional_validations`
- `parallel_lanes`, `mutation_allowed`, `missing_prerequisites`
- `sourceArtifacts`, `warnings`

## Execution router overview

The execution router uses a layered proposal flow:

1. classify task intent
2. consume baseline `task-execution-profile` governance signals when available
3. refine with optional `learning-state` evidence when available
4. emit deterministic proposal-only execution plan

Safe degradation is explicit: missing `task-execution-profile` or `learning-state` artifacts produce deterministic warnings and route defaults instead of autonomous mutation.

Rule: Execution profiles define baseline governance; execution plans choose task-specific routes.

Pattern: Classify -> profile -> refine with learning-state -> emit deterministic execution plan.

Failure Mode: Treating execution profiles as final routes prevents the router from learning from evidence.
