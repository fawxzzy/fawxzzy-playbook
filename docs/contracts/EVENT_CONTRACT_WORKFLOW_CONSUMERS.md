# Event Contract Workflow Consumers

This document defines how downstream repos consume the reusable event-contract validation workflow owned by Playbook.

## Owner Surface

- reusable workflow: `.github/workflows/event-contract-pack.yml`
- owner repo: `fawxzzy-playbook`
- owner responsibility: keep the workflow generic, contract-first, and reusable across docs-only repos and app repos without inventing repo-local dialects

The workflow does not redefine app event schemas. Consumer repos remain the owner of their own event catalog, shadow-mode checks, and warehouse smoke commands.

## Consumer Rules

- callers pass one repo-owned contract-check command
- callers may pass one repo-owned warehouse smoke command when the repo actually owns a shadow-mode emitter or receipt sink
- docs-only repos may omit the warehouse command and validate only their contract-facing docs or schemas
- app repos should keep warehouse smoke checks shadow-only until cutover is explicitly approved

## Current Consumers

- `fawxzzy-fitness`: validates the in-repo fitness event contract and shadow warehouse smoke path
- `fawxzzy-atlas`: validates contract-facing doctrine and schema surfaces only, because Atlas remains architecture truth rather than a runtime owner

## Publish Contract

Consumer repos should reference the workflow by a released Playbook ref whenever possible.

Recommended order:

1. released tag
2. pinned commit SHA
3. `@main` only while the workflow surface is still being proven

Pre-release use of `@main` is acceptable for the first adoption slice, but it is not the long-term stable consumer contract.

## Rollback Path

If a bad Playbook workflow release lands:

1. repin consumer repos to the last known good Playbook tag or commit
2. disable or narrow the new failing caller workflow only if the old pin cannot be restored quickly
3. patch the Playbook workflow on a new ref instead of rewriting consumer-local contract semantics
4. keep repo-owned contract tests and warehouse smoke commands unchanged unless the repo's own contract changed

Rollback is a ref change, not a consumer-side rewrite of the owner workflow behavior.

## Failure Mode

If consumers copy the workflow steps locally instead of calling the owner workflow, the stack reintroduces repo-local workflow dialects and loses one rollback point.
