# Playbook ↔ Lifeline interop (remediation-first v1)

This document defines the deterministic interop seam for bounded remediation work.

## Scope (v1)

Only remediation-loop actions are in scope:

- `test-triage`
- `test-fix-plan`
- `apply-result`
- `test-autofix`
- `remediation-status`

## Canonical pause/resume manifest

`.playbook/rendezvous-manifest.json` remains the source of truth for pause/resume/readiness.
Playbook emits bounded Lifeline requests **only** when rendezvous evaluation is `releaseReady: true`.

## Interop contract shapes

`packages/core/src/contracts/playbookLifelineInterop.ts` and
`packages/contracts/src/playbook-lifeline-interop.schema.json` define these first-class envelopes:

1. capability registration
2. action request
3. action status
4. execution receipt
5. heartbeat/health snapshot
6. blocked/rejected reason
7. retry/reconcile state

## Deterministic runtime loop

Pattern:

`plan -> bounded request -> execution -> receipt -> updated truth`

Rule:

No action is considered real until a receipt returns to Playbook.

Failure mode:

Execution without receipts creates silent drift and destroys trust.

## Durable state

Runtime data is persisted at `.playbook/lifeline-interop-runtime.json` and survives restarts.
Reconcile derives request states from durable receipts with explicit states:

- `pending`
- `running`
- `failed`
- `completed`
- `blocked`

## Inspect surfaces

CLI command:

- `pnpm playbook interop capabilities --json`
- `pnpm playbook interop requests --json`
- `pnpm playbook interop receipts --json`
- `pnpm playbook interop health --json`

Mock runtime command family:

- `pnpm playbook interop register --capability lifeline-remediation-v1 --action test-autofix --json`
- `pnpm playbook interop emit --capability lifeline-remediation-v1 --action test-autofix --json`
- `pnpm playbook interop run-mock --json`
- `pnpm playbook interop reconcile --json`
