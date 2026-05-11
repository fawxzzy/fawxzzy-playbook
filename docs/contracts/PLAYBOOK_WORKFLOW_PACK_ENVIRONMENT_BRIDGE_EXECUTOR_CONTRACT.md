# Playbook Workflow Pack Environment Bridge Executor Contract

This contract defines the future executor boundary for workflow-pack environment bridges without implementing any executor behavior.

It exists so future dry-run and apply layers must inherit explicit mutation, approval, receipt, and rollback semantics from a stable commandless contract rather than hiding those decisions inside workflow YAML, GitHub Actions mutation, or runtime-side effects.

## Contract purpose

The executor contract freezes these boundaries before any implementation surface exists:

- source planning truth remains owned by the environment bridge plan artifact
- execution requests remain declarative and commandless
- mutation targets must stay explicit and finite
- approval remains mandatory before any apply-requested mode
- secrets remain refs only and must never be materialized
- execution receipts must preserve evidence and mutation summaries explicitly

## Required executor fields

The executor export must declare:

- `schemaVersion`
- `workflowPackId`
- `environmentName`
- `sourcePlanRef`
- `executionMode`
- `mutationPolicy`
- `approvalRequired`
- `allowedMutationTargets`
- `forbiddenMutationTargets`
- `requiredSecretRefs`
- `requiredReceiptRefs`
- `preflightChecks`
- `executionSteps`
- `rollbackPlan`
- `receiptRequirements`
- `boundaries`

## Required executor receipt fields

The executor receipt export must declare:

- `schemaVersion`
- `kind`
- `executorId`
- `sourcePlanRef`
- `executionMode`
- `status`
- `completedSteps`
- `skippedSteps`
- `blockers`
- `warnings`
- `evidenceRefs`
- `mutationSummary`
- `receiptRefs`

## Mutation model

- `executionMode` may be `dry_run`, `plan_only`, or `apply_requested`.
- `apply_requested` is only valid when `approvalRequired` remains `true`.
- `allowedMutationTargets` must be explicit, finite, and reviewable.
- `forbiddenMutationTargets` must explicitly ban raw secret values and secret materialization.
- The contract may describe future mutation targets, but it must not perform any mutation itself.

## Secret and receipt handling

- `requiredSecretRefs` must contain only provider-neutral refs such as `ref://github/environment/...`.
- Raw secret values, inline tokens, machine-local secret paths, and secret materialization are forbidden.
- `requiredReceiptRefs` and `receiptRequirements` must remain explicit so downstream executors can prove what evidence and receipts were required before and after any future run.
- Executor receipts must preserve repo-relative evidence refs and explicit mutation summaries instead of synthetic status-only summaries.

## Non-goals

This contract does not include:

- executor implementation
- CLI commands or command docs
- GitHub Actions mutation
- workflow YAML generation
- Lifeline execution integration
- runtime writes
- secret materialization

## Rule

- Executor contracts must define permissible mutation semantics before any future executor is allowed to mutate infrastructure.

## Pattern

- Workflow-pack environment bridge slices advance in order: bridge contract, report builder, planner, executor contract, future dry-run executor, future apply executor.

## Failure Mode

- If apply behavior appears before a stable executor contract exists, mutation authority becomes hidden imperative behavior instead of inspectable Playbook truth.
