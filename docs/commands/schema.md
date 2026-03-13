# `pnpm playbook schema`

Print JSON Schema contracts for Playbook CLI JSON outputs.

## Usage

```bash
pnpm playbook schema
pnpm playbook schema verify
pnpm playbook schema ai-contract --json
pnpm playbook schema contracts --json
```

## Supported schema targets

- `rules`
- `explain`
- `index`
- `graph`
- `verify`
- `plan`
- `context`
- `ai-contract`
- `analyze-pr`
- `doctor`
- `docs`
- `contracts`
- `ignore`
- `query`
- `learn`
- `ai-context`

Without a target, the command prints the full schema registry payload.

Unknown targets fail with a deterministic error and usage guidance.
