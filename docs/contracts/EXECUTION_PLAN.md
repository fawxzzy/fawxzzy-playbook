# Execution Plan Contract (v1)

## Purpose

`execution-plan.schema.json` defines a deterministic, proposal-only artifact for **task-specific routing decisions**.

Artifact path:

- `.playbook/execution-plan.json`

Execution plans are generated per task invocation (`playbook route <task>`) and remain non-mutating (`proposalOnly: true`).

## Relationship to task execution profiles

- `task-execution-profile`: baseline governance profiles by task family.
- `execution-plan`: per-task route selection that consumes profile evidence and optionally refines with learning-state signals.

Rule: Execution profiles define baseline governance; execution plans choose task-specific routes.

## Contract shape

Top-level fields:

- `schemaVersion`: fixed schema version (`1.0`)
- `kind`: fixed artifact kind (`execution-plan`)
- `generatedAt`: deterministic ISO timestamp
- `proposalOnly`: fixed `true`
- `task_family`: selected task family
- `route_id`: deterministic route key
- `rule_packs`: selected governance packs
- `required_validations`: required validation bundle
- `optional_validations`: optional validation bundle
- `parallel_lanes`: deterministic lane suggestions
- `mutation_allowed`: route-level mutation allowance
- `missing_prerequisites`: explicit missing prerequisites
- `sourceArtifacts`: source artifact availability (`taskExecutionProfile`, `learningState`)
- `learning_state_available`: whether a concrete learning-state snapshot was available for route refinement
- `route_confidence`: bounded confidence score for the selected route (0-1)
- `open_questions`: explicit evidence gaps requiring more telemetry before stronger optimization
- `warnings`: deterministic degradation/refinement warnings

## Determinism and degradation

Pattern: Classify -> profile -> refine with learning-state -> emit deterministic execution plan.

When optional artifacts are unavailable, route emits a valid plan with deterministic fallback defaults and warnings, rather than failing hard.

## Failure mode

Failure Mode: Treating execution profiles as final routes prevents the router from learning from evidence.


Rule: Learning-state may refine routes, but it must not erase baseline governance.

Pattern: Evidence-aware routing improves efficiency when optimization is bounded by required validations.

Failure Mode: Speed-optimized routing that removes baseline governance creates invisible fragility.
