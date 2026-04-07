# Playbook Local-First Workflow Model

## Purpose

Define the temporary and long-term workflow contract that lets Playbook operate without GitHub as mandatory CI, publishing orchestration, or status truth.

## Current assumption inventory

Before this slice, several workflow surfaces still leaned GitHub-first even when local execution already existed:

- PR and review language was often the default narrative for change validation.
- CI descriptions implied remote pipeline status as the normal gate.
- Release-prep docs emphasized GitHub-hosted orchestration as the main publishing path.
- Some operator wording blurred verification, publishing, and deployment into one remote-shaped workflow story.

These assumptions were mostly documentary and transport-oriented, but they still pushed operators toward one provider-shaped mental model.

## Local-first contract

Playbook now treats the workflow as three separate concerns:

- Verification: repo-local gate result. The source of truth is `.playbook/local-verification-receipt.json`.
- Publishing: optional sync to a remote provider. The source of truth, when observed, belongs to the provider and is not required for local verification.
- Deployment: runtime promotion or handoff. The source of truth belongs to the deployment or handoff surface and is not inferred from verification or publishing.

## Temporary operating model

Use `verify:local` as the repo-defined CI replacement contract:

```bash
pnpm playbook verify --local --json
pnpm playbook verify --local-only --json
```

- `--local` runs governed Playbook verification plus the repo-defined local gate.
- `--local-only` runs only the repo-defined local gate and still writes the same durable receipt and logs.
- If a repo defines `package.json#scripts.verify:local`, Playbook will use it by default.
- A repo may override the command with `playbook.config.json -> verify.local.command`.

## Long-term direction

- Keep SCM and remote-provider context additive and optional.
- Preserve provider-specific transports such as GitHub comments, Actions, and PR review helpers as sidecars, not authority.
- Let publishing and deployment integrate through explicit provider or handoff contracts later, without changing local verification truth.

## Rule

- CI is a release gate, not a place. If the commands are known, the gate can run locally.

## Pattern

- Local gate receipt -> optional publish sync -> optional deployment handoff.

## Failure Mode

- When verification, publishing, and deployment are treated as one GitHub-shaped lifecycle, Playbook stays operationally dependent on one provider even when the repo can already prove state locally.
