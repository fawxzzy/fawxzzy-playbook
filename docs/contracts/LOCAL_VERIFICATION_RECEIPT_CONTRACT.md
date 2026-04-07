# Local Verification Receipt Contract

`packages/contracts/src/local-verification-receipt.schema.json` is the shared contract for local-first verification evidence.

## Rule

- Local verification truth must come from a durable repo-local receipt, not from an external provider status.

## Pattern

- Run the repo-defined local gate, write one receipt, and keep publishing and deployment as separate workflow concerns.

## Failure Mode

- Treating GitHub or another remote provider as mandatory verification truth keeps the workflow operationally dependent on one external platform.

## Contract fields

- `verification_mode`: whether the run was `governance-only`, `combined`, or `local-only`.
- `provider`: optional remote/provider context. This is descriptive, not verification authority.
- `workflow.verification`: local gate result and receipt path. This is the verification source of truth.
- `workflow.publishing`: optional remote sync state. Publishing does not imply verification or deployment.
- `workflow.deployment`: runtime promotion or handoff state. Deployment does not imply verification or publishing.
- `local_verification`: executed command, package manager, exit code, timings, and durable stdout/stderr evidence paths.
- `governance`: additive summary of Playbook governance findings when governance evaluation also ran.

## Current usage

- `pnpm playbook verify --local --json`
- `pnpm playbook verify --local-only --json`

Both flows write:

- `.playbook/local-verification-receipt.json`
- `.playbook/local-verification-receipts.json`
- `.playbook/local-verification/*.stdout.log`
- `.playbook/local-verification/*.stderr.log`
