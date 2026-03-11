# `pnpm playbook pilot`

Run one deterministic baseline external-repository analysis cycle.

## Usage

- `pnpm playbook pilot --repo "<target-repo-path>"`
- `pnpm playbook pilot --repo "<target-repo-path>" --json`

Optional convenience alias:

- `pnpm pilot "<target-repo-path>"`

## Behavior

`pilot` runs this fixed sequence in one top-level workflow:

1. `context --json`
2. `index --json`
3. `query modules --json`
4. `verify --json` (writes `.playbook/findings.json`)
5. `plan --json` (writes `.playbook/plan.json`)

The command writes:

- `.playbook/repo-index.json`
- `.playbook/repo-graph.json`
- `.playbook/findings.json`
- `.playbook/plan.json`
- `.playbook/pilot-summary.json`
- `.playbook/runtime/current/*`
- `.playbook/runtime/cycles/*`
- `.playbook/runtime/history/*`

`--json` emits a compact summary with target repo path, framework inference, architecture inference, module count, verify warning/failure counts, remediation status, and artifact paths.

Rule - Repeated Multi-Step Operator Flows Deserve a First-Class Command.

Pattern - Orchestrated Baseline Analysis.

Failure Mode - Manual Workflow Drift.

Failure Mode - Helper Script Becomes Shadow Product Surface.
