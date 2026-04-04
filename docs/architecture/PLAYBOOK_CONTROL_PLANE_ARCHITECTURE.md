# Playbook Control Plane Architecture (v1)

## Purpose

This document makes Playbook's control-plane behavior explicit and canonical.

- **Rule:** The control plane must be an explicit contract, not an implied behavior spread across adjacent artifacts.
- **Pattern:** session/evidence -> control-plane state -> bounded runtime/execution decisions.
- **Failure Mode:** Without a canonical control-plane contract, the system behaves coherently but remains hard to inspect, reason about, and extend safely.

## Actor classes

Playbook control-plane state models these actor classes:

1. `planner-control-plane`
2. `runtime-operator-plane`
3. `app-domain-plane`
4. `review-approval-actor`

## Execution modes

Playbook control-plane state models these deterministic execution modes:

1. `read-runtime-inspection`
2. `proposal-only`
3. `reviewed-mutation`
4. `bounded-external-execution`

## Canonical artifact

Control-plane state is emitted as:

- `.playbook/control-plane.json`

This artifact is read-only in v1 and carries additive runtime context only. It does **not** grant new mutation authority.

## Source-of-truth inputs

v1 composes control-plane state only from canonical evidence surfaces:

- `.playbook/session.json`
- `.playbook/evidence-envelope.json` (or equivalent session/evidence seam)
- `.playbook/execution-runs/*.json`
- `.playbook/execution-merge-guards.json`
- `.playbook/rendezvous-manifest.json`
- `.playbook/lifeline-interop-runtime.json`

## Required deterministic fields

- active actors
- active execution mode
- active approvals/blockers
- mutation scope level
- external execution presence
- receipt lineage references
- stale/invalid state indicators
- source artifact validity snapshot
- authority invariants (`mutation=read-only`, `execution=unchanged`)

## Fail-closed behavior

If required evidence is missing, stale, invalid, or contradictory, the artifact must degrade to a fail-closed posture:

- stale/invalid indicators are populated deterministically.
- mutation scope degrades to `none`.
- execution mode degrades to `read-runtime-inspection`.

## Existing additive read surfaces

v1 surfaces the control-plane artifact through existing read/runtime surfaces only:

- `status proof`
- `query runs`
- `agent run --from-plan ... --dry-run`

No new top-level command family is introduced in this phase.
