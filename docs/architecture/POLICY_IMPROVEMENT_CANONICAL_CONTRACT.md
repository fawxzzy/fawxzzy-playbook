# POLICY_IMPROVEMENT_CANONICAL_CONTRACT

## Purpose

Define the canonical runtime contract for deterministic, candidate-only outcome learning policy improvement.

The contract is materialized as:

- `.playbook/policy-improvement.json`

This artifact is additive and review-only. It **does not** mutate governance rules, policy gates, or execution behavior.

## Canonical input sources

`policy-improvement` is derived from existing canonical artifacts only:

- `.playbook/outcome-feedback.json`
- `.playbook/learning-state.json`
- `.playbook/learning-clusters.json`
- `.playbook/graph-informed-learning.json`
- `.playbook/policy-evaluation.json`
- `.playbook/remediation-status.json`
- `.playbook/test-autofix-history.json`
- `.playbook/pr-review.json`

## Deterministic sections

The artifact contains deterministic sections for:

- candidate ranking adjustments
- prioritization improvement suggestions
- repeated blocker influence
- confidence trend notes
- review-required flags
- provenance refs

All sections are sorted deterministically and remain advisory/candidate-only.

## Governance boundary

`policy-improvement` enforces explicit non-mutation authority:

- `authority.mutation = read-only`
- `authority.promotion = review-required`
- `authority.ruleMutation = forbidden`

Review flags are explicit and always set to require human review. This preserves the existing trust boundary:

- no rule mutation
- no policy mutation
- no promotion side effects
- no execution side effects

## Runtime surface

The artifact is surfaced through existing read/runtime family seams:

- producer path: `pnpm playbook telemetry learning --json` (writes `.playbook/policy-improvement.json`)
- reader path: `pnpm playbook memory policy-improvement --json`

This keeps outcome-learning policy improvement observable without widening mutation authority.

## Canonical pattern / rule / failure mode

- **Rule:** Reviewed outcomes may improve ranking/prioritization, but may not mutate governance directly.
- **Pattern:** `outcome-feedback -> learning signals -> policy improvement candidates -> human-reviewed promotion`.
- **Failure Mode:** Treating outcome learning as direct policy mutation bypasses the same review boundaries the rest of the system already enforces.
