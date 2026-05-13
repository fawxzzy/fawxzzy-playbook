# QA

`fawxzzy-playbook` owns its QA intent through repo-local manifests in `qa/adapters/` and `qa/scenarios/`.

ATLAS root owns:
- execution
- validation
- evidence indexing
- reporting
- promotion decisions

This repo satisfies QA LLEL through docs and command evidence, not fake visual coverage.

Current primary scenario:
- `playbook.docs-governance`

Primary repo-native checks:
- `pnpm lint`
- `pnpm docs:check`
- `pnpm validate:docs-governance`

If ATLAS promotion is blocked, fix the underlying repo check first. Do not weaken ATLAS QA to bypass repo lint or docs governance failures.
