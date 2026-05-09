# Playbook Convergence Scan Contract - Draft v1

## Purpose

A convergence scan answers whether a repository has explicit, evidence-backed Playbook adoption and what it still needs before root or fleet surfaces may project it as adopted or verified.

## Non-goals

- It does not certify product correctness.
- It does not replace repo-local tests.
- It does not copy owner-repo doctrine into Playbook.
- It does not authorize execution.
- It does not make Atlas root a second canonical store.

## Output artifact

Default output path:

```text
.playbook/convergence-scan.json
```

## Required top-level fields

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `playbook.convergence.scan.v1` |
| `generatedAt` | ISO timestamp |
| `repo` | repo identity, path, role, and optional stack surface id |
| `contractClaim` | claimed Playbook contract id/version/status |
| `sources` | evidence refs read by the scan |
| `checks` | implemented / missing / not applicable / exceptioned checks |
| `verification` | verification report refs, commands, status, and declared scope |
| `trustPosture` | negative-safe status fields |
| `nextActions` | deterministic candidate next slices |

## Status rules

- `missing`: no claim or evidence.
- `partial`: claim exists but evidence or verification is incomplete.
- `adopted`: repo-local adoption evidence validates, but verified report is absent or not green.
- `verified`: adoption evidence validates, verification report validates, scope is explicit, and verification command is reproducible.
- `exception`: explicit exception has owner, rationale, risk, compensating control, and retirement trigger.

## Fail-closed rules

The scan must render non-green when:

- contract id/version is missing,
- schema validation fails,
- owner truth is duplicated instead of referenced,
- verification report claims broad status without scope,
- trust posture is ambiguous,
- raw transcript is presented as canonical memory,
- app/root execution authority is implied by read-only evidence.

## Source classifications

- `owner_contract`: Playbook-owned contract/schema/export.
- `repo_adoption_evidence`: owner-repo adoption evidence.
- `repo_verification_report`: owner-repo verification proof.
- `root_projection`: Atlas/root read-only projection.
- `execution_boundary`: Lifeline or equivalent approval/execution evidence.
- `domain_truth`: owner-repo product or domain docs.
- `external_pack`: imported/evaluated playbook pack.
- `production_observation`: structural production metadata snapshot.

## Review principle

A convergence report should be brief-thin for humans and artifact-rich for machines:

- human report: decision/status, affected surface, blockers, next action;
- JSON artifact: all source refs, digests, checks, and evidence details.
