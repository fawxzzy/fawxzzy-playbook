# `pnpm playbook doctor`

Diagnose repository health by aggregating verify, risk, docs, architecture-audit, artifact-hygiene, and memory diagnostics.

## Usage

```bash
pnpm playbook doctor
pnpm playbook doctor --json
pnpm playbook doctor --ai
pnpm playbook doctor --fix --dry-run
pnpm playbook doctor --fix --yes
```

## Options

- `--ai`: include AI-readiness diagnostics in doctor output.
- `--fix`: enable deterministic doctor fix planning/apply mode.
- `--dry-run`: preview doctor fixes without writing changes.
- `--yes`: apply eligible doctor fixes without confirmation.
- `--json` / `--format json`: machine-readable output.
- `--quiet`: suppress success output in text mode.

## Behavior

- Surfaces findings grouped across architecture, docs, testing, risk, and memory categories.
- Integrates architecture-audit checks into health reporting.
- Reports structured `artifactHygiene` and `memoryDiagnostics` payloads in JSON mode.
- Returns stable machine-readable contracts for automation via `--json`.
