# Repository Memory Knowledge Contract

## Purpose

Define deterministic replay/consolidation behavior for `.playbook/memory/*` episodic events into candidate knowledge artifacts for human review.

## Replay pipeline

Canonical flow:

1. Read `.playbook/memory/index.json`.
2. Resolve and load each referenced event file.
3. Cluster events by `fingerprint/module/rule/failure shape`.
4. Compute deterministic salience factors from explicit event inputs only.
5. Emit `.playbook/memory/candidates.json`.

Replay is read-only with respect to repository source/governance files (rules/docs/code).

## Pattern: Replay Before Promotion

All candidate knowledge promotion decisions should start from replayed clustered events with provenance, not ad-hoc narrative memory.

## Rule: Salience Gates Consolidation

Candidate generation and ordering must be driven by explicit salience factors only:

- severity
- recurrence count
- cross-module breadth
- risk score
- persistence across runs
- ownership/docs gaps
- novel successful remediation shape

No hidden/implicit model inference is allowed to alter salience ordering.

## Failure Mode: Candidate Flood From Low-Signal Events

When low-signal events bypass salience gates, candidate volume rises while reviewer signal quality drops. Replay implementations should preserve deterministic clustering and scoring to keep candidate sets reviewable.

## Candidate schema expectations

Each candidate in `.playbook/memory/candidates.json` includes:

- stable candidate id
- kind (`decision | pattern | failure_mode | invariant | open_question`)
- salience score and factor breakdown
- cluster key (`fingerprint/module/rule/failure shape`)
- provenance references (`eventId`, `sourcePath`, run context)
