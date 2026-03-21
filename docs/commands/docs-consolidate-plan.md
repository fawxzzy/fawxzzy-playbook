# `pnpm playbook docs consolidate-plan`

`pnpm playbook docs consolidate-plan` turns the proposal-only `.playbook/docs-consolidation.json` artifact into an apply-compatible reviewed-write plan for protected singleton docs.

## Usage

```bash
pnpm playbook docs consolidate-plan
pnpm playbook docs consolidate-plan --json
pnpm playbook apply --from-plan .playbook/docs-consolidation-plan.json
```

## Contract

- Input: `.playbook/docs-consolidation.json`
- Output: `.playbook/docs-consolidation-plan.json`
- Execution: `apply --from-plan` is the only mutation boundary

The planner emits tasks only for bounded managed-write operations:

- replace managed block
- append managed block
- insert under explicit anchor

Each executable task is stamped with reviewed preconditions so apply is target-locked to the exact state that was reviewed:

- `target_path`
- `target_file_fingerprint`
- `managed_block_fingerprint` or `anchor_context_hash`
- `approved_fragment_ids`
- `planned_operation`

Anything ambiguous stays excluded with a machine-readable reason. If a protected singleton target drifts after review, `apply --from-plan` fails closed for that target and leaves the file unchanged.

## Governance

- Rule: Reviewed consolidation plans must apply only against the target state they were reviewed against.
- Rule: Consolidation planning may prepare reviewed writes, but `apply` remains the only mutation boundary.
- Pattern: Review plans on fingerprints, execute only on matching fingerprints.
- Pattern: Workers propose, consolidator compiles, apply executes.
- Failure Mode: Applying reviewed singleton-doc writes against drifted targets reopens merge-hotspot risk under a deterministic-looking surface.
- Failure Mode: Letting docs consolidation mutate directly creates a shadow executor and breaks the single reviewed write boundary.
