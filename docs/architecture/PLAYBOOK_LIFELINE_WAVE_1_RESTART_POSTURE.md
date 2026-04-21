# Playbook Lifeline Wave 1 restart posture

This is a shadow codification doc for the Wave 1 Lifeline launch. It captures only the proof surfaces Playbook can safely mirror from the launch split; it does not own Lifeline implementation or expand Playbook into the runtime lane.

## Scope

Wave 1 is split into five proof-bearing slices:

- W1: runtime foundation
- W2: deploy contract
- W3: ops baseline
- W4: Trove pilot migration
- W5: Playbook shadow codification

Restart rule:

- if the launch restarts, replay proof from the first unresolved slice
- do not treat prior intent as evidence
- do not mark parity complete until the last required receipt or artifact is present

## Executable checklist

| Gate | Required proof | Pass condition | Stop condition |
| --- | --- | --- | --- |
| Runtime foundation | single-host runtime contract, port/routing/TLS boundary, env injection points, storage assumptions, health path expectation | the runtime boots cleanly and exposes the agreed health path | any host/runtime assumption is still implicit or split across unrelated docs |
| Deploy contract | release manifest or schema with artifact/image ref, route/domain, env refs, health path, migration hooks, rollback target | the manifest validates and dry-run planning can round-trip the release metadata | deploy metadata is present only as prose or an ad hoc note |
| Ops baseline | structured log contract, health visibility, smoke checks, rollback runbook | operators can inspect health, run a smoke, and rehearse rollback from documented steps | the pilot depends on manual interpretation of logs or undocumented recovery steps |
| Pilot acceptance | parity checklist, fallback criteria, rollback rehearsal evidence | Trove can be cut over with Vercel treated as fallback, not required runtime | parity is claimed before rollback rehearsal or before the acceptance criteria are explicit |
| Playbook shadow | linked evidence map from each Lifeline slice to a checklist or decision row | every Lifeline proof surface resolves to one Playbook checklist or decision entry | Playbook starts inventing implementation detail instead of recording proof |

## Decisions captured by the restart posture

| Area | Decision surface | What must be proved |
| --- | --- | --- |
| Runtime foundation | one host, one app runtime contract, one health path | the runtime foundation is sufficient for a pilot without widening into deployment orchestration |
| Deploy contract | explicit release metadata schema | deploy, rollback, and validation consumers can read the same contract shape |
| Ops baseline | logs, health, smoke, rollback | operators can diagnose, verify, and recover without reading source code first |
| Pilot acceptance | parity before fallback removal | Trove can run on Lifeline with a concrete fallback story and a rehearsed rollback |

## Failure modes and anti-patterns

- Treating the runtime foundation as a deployment contract problem.
- Treating a deploy schema as a replacement for operational proof.
- Counting structured logs as parity when health and rollback are still unverified.
- Letting the pilot depend on Vercel while claiming the fallback has already been retired.
- Collapsing Playbook shadow documentation into Lifeline implementation guidance.
- Promoting assumptions from the launch plan into doctrine before a Lifeline receipt or artifact proves them.

## Parity criteria

Parity is explicit only when all of the following are true:

- the Lifeline health path is visible and stable enough for the pilot to rely on it
- the release metadata round-trips through validation and dry-run planning
- the operator baseline includes logs, smoke checks, and rollback instructions that match the deploy contract
- the pilot checklist is complete enough that Vercel is fallback-only, not required runtime
- rollback has been rehearsed against the same contract that would be used in a real cutover

If any of those items are still unproven, parity is not yet a Playbook truth surface.

## Doctrine gaps waiting on fresh Lifeline evidence

- the exact runtime foundation receipt or artifact set for W1
- the final deploy manifest field set and its validation output for W2
- the concrete ops smoke and rollback evidence for W3
- the actual Trove parity and fallback evidence for W4
- the final cross-link from each Lifeline proof surface into a stable Playbook decision entry

## Related docs

- [Playbook and Lifeline interop](./playbook-lifeline-interop.md)
- [Control loop and layer ownership](./CONTROL_LOOP_AND_LAYER_OWNERSHIP.md)
