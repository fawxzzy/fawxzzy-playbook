# Playbook Workflow Pack Environment Bridge Contract

This contract defines a commandless metadata bridge between the reusable Playbook workflow pack and environment-gated publish or deployment boundaries.

It does not create a new command family, mutate GitHub Actions, or widen Lifeline execution behavior. It freezes the metadata that consumer repos and operator layers can inherit when they need explicit environment gates around existing Playbook workflow-pack contracts.

## Contract purpose

The environment bridge exists to keep these boundaries explicit:

- local verification truth remains owned by local verification receipts
- staged promotion truth remains owned by workflow promotion receipts
- environments are gates for approval, publish, and deployment decisions, not verification truth themselves
- secrets must be referenced, never embedded
- consumer repos inherit declared contracts, not hidden workflow behavior

## Required fields

The bridge export must declare:

- `workflowPackId`
- `environmentName`
- `verificationGate`
- `approvalPolicy`
- `requiredSecrets`
- `secretRefsOnly`
- `publishMode`
- `deploymentMode`
- `receiptRefs`
- `consumerRules`

## Verification and approval model

- `verificationGate` declares which evidence refs must exist before an environment gate can be considered satisfied.
- `approvalPolicy` declares the human or protected-environment policy required after verification succeeds.
- Receipt refs must stay explicit so downstream consumers can prove what evidence or promotion artifact a gate depended on.

Environment gates are not allowed to replace verification receipts with a synthetic status summary. A downstream system may compose verification and approval outcomes, but it must preserve refs back to the underlying owner artifacts.

## Secret handling

- `requiredSecrets` must contain provider-neutral secret refs such as `ref://github/environment/...`.
- `secretRefsOnly` must remain `true`.
- Raw secret values, inline tokens, and machine-specific secret paths are forbidden in the bridge artifact.

## Consumer inheritance rules

- Consumer repos inherit the workflow-pack environment bridge as metadata, not as an executable workflow.
- Compatibility layers may project this contract into provider-specific workflow files, but those projections must remain derived surfaces.
- Downstream repos must not treat the bridge as permission to redefine verification truth, approval semantics owned elsewhere, or Lifeline execution behavior.

## Non-goals

This contract does not include:

- reusable workflow implementation YAML
- GitHub Actions mutation
- Lifeline execution changes
- command docs or CLI surfaces
- runtime writes or generated deployment state

## Rule

- Environment-gated workflow-pack adoption must preserve explicit verification, approval, secret-ref, and receipt-ref boundaries instead of hiding them inside provider-specific workflow behavior.

## Pattern

- Publish the environment bridge as a schema-backed metadata contract first, then let future planners or compatibility layers consume it explicitly.

## Failure Mode

- If an environment bridge embeds raw secrets, hides receipt dependencies, or claims execution semantics directly, downstream repos stop being able to distinguish verification truth from deploy authority.
