# Deterministic Architecture Role Inference

- Rule: Role inference should be derived from structural evidence, not hand-written labels.
- Pattern: graph -> role inference -> read surfaces.
- Failure Mode: Governance grows faster than structural observation, so rules are enforced on shaky understanding.

## Current canonical roles (first slice)

- `interface`
- `orchestration`
- `foundation`
- `adapter`

## Deterministic evidence model

Role inference is read-only and computed from repository graph `depends_on` edges:

- `incomingDependencies`: how many modules depend on this module.
- `outgoingDependencies`: how many modules this module depends on.
- `dependencyDirection`: `inbound`, `outbound`, `bidirectional`, or `isolated`.

Classification rules are deterministic and additive in read models.
