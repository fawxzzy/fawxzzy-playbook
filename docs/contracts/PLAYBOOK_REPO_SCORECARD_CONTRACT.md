# Playbook Repo Scorecard Contract

## Purpose

This contract defines a commandless, evidence-backed scorecard shape for repository posture reviews.

The scorecard is a deterministic artifact, not a command surface. It exists so standards can become stable review inputs before any engine builder, query surface, or CLI command is introduced.

## Contract boundary

The scorecard must:

- score evidence-backed posture rather than narrative opinions
- stay machine-readable and schema-versioned
- use repo-relative evidence references
- remain commandless until check semantics and report builders are stable

The scorecard must not:

- claim command availability
- require runtime writes
- depend on local absolute paths
- use unstable timestamps for static examples

## Required dimensions

Every scorecard artifact in this family must carry exactly these dimension ids:

- `owner_truth`
- `command_truth`
- `verification_truth`
- `artifact_hygiene`
- `docs_governance`
- `workflow_pack_adoption`
- `local_verification`
- `roadmap_governance`

## Status vocabulary

Allowed dimension and overall statuses:

- `verified`
- `partial`
- `missing`
- `not_applicable`

Rule: a status must be justified by explicit evidence references, not implied from undocumented repo familiarity.

## Evidence expectations

Each dimension must include:

- a stable dimension id
- a human-readable title
- a status from the allowed vocabulary
- a short summary
- one or more repo-relative evidence references

Optional:

- `nextAction` when the posture is not yet `verified`

## Promotion path

Pattern: static scorecard contract -> validator -> stable example -> engine builder -> optional query/status surface

Failure mode: adding a scorecard command before evidence categories and grading semantics are stable turns standards into a narrative dashboard instead of a deterministic review surface.
